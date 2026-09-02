import mongoose from 'mongoose'
import crypto from 'crypto'
import userModel from '../models/userModel.js'
import bonusSettingsModel from '../models/bonusSettingsModel.js'
import pointsTransactionModel from '../models/pointsTransactionModel.js'
import {
    BONUS_SETTINGS_SINGLETON_KEY,
    BONUS_SETTINGS_DEFAULTS,
    isValidSettingsSection,
    isValidTransactionType,
    isValidTransactionStatus,
} from '../constants/bonusConstants.js'

/**
 * All shared logic for the Redeemable Bonus Program lives here, so it is
 * written once and called from registration, all three order-placement
 * paths, fulfilment (updateStatus), and cancel/refund — never tripled.
 *
 * Every function that touches both a ledger row and a user's cached
 * pointsBalance runs inside a Mongo transaction. This requires the database
 * to be a replica set (true of MongoDB Atlas, including the free tier) —
 * there is no background job system in this app to run an eventual-
 * consistency reconciliation pass, so a synchronous transaction is the only
 * reliable way to keep the ledger and the cached balance from drifting apart
 * under concurrent requests.
 */

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100

const runInTransaction = async (fn) => {
    const session = await mongoose.startSession()
    try {
        let result
        await session.withTransaction(async () => {
            result = await fn(session)
        })
        return result
    } finally {
        session.endSession()
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Settings
// ─────────────────────────────────────────────────────────────────────────────

/** Lazy-create the singleton on first read — no seed script needed. */
export const getSettings = async () => {
    const settings = await bonusSettingsModel.findOneAndUpdate(
        { singletonKey: BONUS_SETTINGS_SINGLETON_KEY },
        { $setOnInsert: { singletonKey: BONUS_SETTINGS_SINGLETON_KEY } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
    )
    return settings
}

/**
 * Admin write. `patch` is merged into exactly one section, and only fields
 * that section's defaults actually declare are accepted — an unrecognised
 * key is silently dropped rather than written verbatim into the document.
 */
export const updateSettings = async (section, patch) => {
    if (!isValidSettingsSection(section)) {
        throw new Error(`Unknown settings section: ${section}`)
    }
    await getSettings()

    const allowedFields = Object.keys(BONUS_SETTINGS_DEFAULTS[section])
    const set = { updatedAt: Date.now() }
    for (const field of allowedFields) {
        if (patch && Object.prototype.hasOwnProperty.call(patch, field)) {
            set[`${section}.${field}`] = patch[field]
        }
    }

    return bonusSettingsModel.findOneAndUpdate(
        { singletonKey: BONUS_SETTINGS_SINGLETON_KEY },
        { $set: set },
        { new: true, runValidators: true },
    )
}

// ─────────────────────────────────────────────────────────────────────────────
// Referral codes
// ─────────────────────────────────────────────────────────────────────────────

// Uppercase alphanumeric, ambiguous characters (0/O, 1/I) excluded so a code
// read aloud or hand-typed from a link doesn't misfire.
const REFERRAL_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const REFERRAL_CODE_LENGTH = 8

const randomReferralCode = () => {
    let code = ''
    for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) {
        code += REFERRAL_CODE_ALPHABET[crypto.randomInt(REFERRAL_CODE_ALPHABET.length)]
    }
    return code
}

export const generateReferralCode = async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
        const code = randomReferralCode()
        const exists = await userModel.exists({ referralCode: code })
        if (!exists) return code
    }
    throw new Error('Could not generate a unique referral code after 5 attempts')
}

/** Backfill-on-read for accounts created before this feature existed. */
export const ensureReferralCode = async (user) => {
    if (user.referralCode) return user.referralCode
    const code = await generateReferralCode()
    await userModel.findByIdAndUpdate(user._id, { $set: { referralCode: code } })
    user.referralCode = code
    return code
}

/**
 * Resolves a `?ref=` code to its owner. Returns null — never throws — for an
 * unknown, malformed, or missing code: registration must never fail because
 * of a bad or stale referral link.
 */
export const resolveReferrer = async (code) => {
    if (!code || typeof code !== 'string') return null
    const trimmed = code.trim().toUpperCase()
    if (!trimmed) return null
    try {
        return await userModel.findOne({ referralCode: trimmed })
    } catch (error) {
        console.log('[bonus] resolveReferrer failed', error.message)
        return null
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Welcome bonus
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Immediately confirmed (not pending) — a fresh signup carries no fraud
 * exposure comparable to an order that can still be cancelled or refunded.
 * Idempotent via welcomeBonusGrantedAt, claimed with a conditional $set
 * before writing the ledger row, so a retried registerUser/googleLogin call
 * cannot double-grant it.
 */
export const grantWelcomeBonus = async (userId) => {
    try {
        const settings = await getSettings()
        if (!settings.welcome.active || settings.welcome.points <= 0) return { granted: false }

        return await runInTransaction(async (session) => {
            const claimed = await userModel.findOneAndUpdate(
                { _id: userId, welcomeBonusGrantedAt: null },
                { $set: { welcomeBonusGrantedAt: Date.now() } },
                { new: true, session },
            )
            if (!claimed) return { granted: false }

            const now = Date.now()
            await pointsTransactionModel.create([{
                userId: String(userId),
                type: 'welcome',
                points: settings.welcome.points,
                status: 'confirmed',
                confirmedAt: now,
                date: now,
                note: 'Welcome bonus',
            }], { session })

            await userModel.findByIdAndUpdate(
                userId, { $inc: { pointsBalance: settings.welcome.points } }, { session },
            )

            return { granted: true, points: settings.welcome.points }
        })
    } catch (error) {
        // Never throws: a bonus-ledger failure must not fail registration.
        console.log('[bonus] grantWelcomeBonus failed for user', String(userId), error.message)
        return { granted: false, reason: 'exception' }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Purchase points
// ─────────────────────────────────────────────────────────────────────────────

/** Pure — no side effects. `orderAmount` is the order total INCLUDING delivery. */
export const previewPurchasePoints = ({ orderAmount, deliveryFee = 0, settings }) => {
    if (!settings?.purchase?.active) return 0
    const base = Math.max(0, (Number(orderAmount) || 0) - (Number(deliveryFee) || 0))
    if (base < settings.purchase.minOrderAmount) return 0
    return Math.floor(base * settings.purchase.earnRatePerCurrencyUnit)
}

/** Writes a PENDING row only — the balance is not incremented until confirmOrderBonuses. */
export const awardPurchasePoints = async ({ userId, orderId, points, settings, session }) => {
    if (!settings?.purchase?.active || !points || points <= 0) return null
    const now = Date.now()
    const [tx] = await pointsTransactionModel.create([{
        userId: String(userId),
        type: 'purchase',
        points,
        status: 'pending',
        sourceOrderId: String(orderId),
        date: now,
        note: 'Points from purchase',
    }], { session })
    return tx
}

// ─────────────────────────────────────────────────────────────────────────────
// Referral bonus (double-sided)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fires once, on the referred customer's first qualifying order. Both rows —
 * referrer's and referee's — plus the one-shot conversion gate are written in
 * the SAME transaction, so a mid-write failure can never leave the gate set
 * without the rows existing, or vice versa.
 */
export const awardReferralBonusIfEligible = async ({ refereeUserId, orderId, orderAmount, settings, session }) => {
    if (!settings?.referral?.active) return { awarded: false }

    const referee = await userModel.findById(refereeUserId).session(session)
    if (!referee || !referee.referredBy || referee.referral?.convertedAt) {
        return { awarded: false }
    }
    if ((Number(orderAmount) || 0) < settings.referral.minQualifyingOrderAmount) {
        return { awarded: false }
    }

    const referrer = await userModel.findById(referee.referredBy).session(session)
    if (!referrer) return { awarded: false }

    // Atomic claim — the actual guard against a double-fire, not the
    // precheck above (which only avoids a wasted referrer lookup).
    const claimed = await userModel.findOneAndUpdate(
        { _id: refereeUserId, 'referral.convertedAt': null },
        { $set: { 'referral.convertedAt': Date.now(), 'referral.convertedOrderId': String(orderId) } },
        { new: true, session },
    )
    if (!claimed) return { awarded: false }

    const now = Date.now()

    if (settings.referral.referrerPoints > 0) {
        await pointsTransactionModel.create([{
            userId: String(referrer._id),
            type: 'referral_referrer',
            points: settings.referral.referrerPoints,
            status: 'pending',
            sourceOrderId: String(orderId),
            relatedUserId: String(refereeUserId),
            date: now,
            note: 'Referral bonus — a friend you referred placed a qualifying order',
        }], { session })
    }

    if (settings.referral.refereePoints > 0) {
        await pointsTransactionModel.create([{
            userId: String(refereeUserId),
            type: 'referral_referee',
            points: settings.referral.refereePoints,
            status: 'pending',
            sourceOrderId: String(orderId),
            relatedUserId: String(referrer._id),
            date: now,
            note: 'Referral bonus — welcomed via a friend',
        }], { session })
    }

    return { awarded: true }
}

export const getReferralStats = async (userId) => {
    const [referredCount, convertedCount] = await Promise.all([
        userModel.countDocuments({ referredBy: String(userId) }),
        userModel.countDocuments({ referredBy: String(userId), 'referral.convertedAt': { $ne: null } }),
    ])
    return { referredCount, convertedCount }
}

// ─────────────────────────────────────────────────────────────────────────────
// Redemption
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The client sends only an intent ("I'd like to apply N points") — this is
 * the sole place `discountAmount` is computed, always server-side, from the
 * server's own read of `pointsBalance` and the admin-configured settings.
 * Reading the balance INSIDE the same transaction that later debits it is
 * what closes the double-spend race: Mongo's write-conflict detection on the
 * user document serializes two concurrent redemption attempts.
 *
 * NOTE: `orderAmount` here is still the pre-existing, client-supplied order
 * total — orderController.js has no server-side recomputation of it from
 * item prices. That gap predates this feature and is out of scope here; this
 * function only guarantees that whatever `orderAmount` turns out to be, the
 * redemption on top of it is capped and balance-checked correctly.
 */
export const computeRedemption = async ({ userId, requestedPoints, orderAmount, settings, session }) => {
    const none = { pointsToRedeem: 0, discountAmount: 0 }
    if (!settings?.redemption?.active) return none

    const requested = Math.floor(Number(requestedPoints) || 0)
    if (requested <= 0) return none

    const user = await userModel.findById(userId).session(session)
    if (!user) return none

    const capByBalance = Math.max(0, user.pointsBalance)
    const capByOrder = Math.floor(
        (Number(orderAmount) || 0)
        * (settings.redemption.maxRedemptionPercent / 100)
        * settings.redemption.redeemRatePerCurrencyUnit,
    )

    let pointsToRedeem = Math.min(requested, capByBalance, capByOrder)
    if (pointsToRedeem < settings.redemption.minRedeemPoints) pointsToRedeem = 0
    if (pointsToRedeem <= 0) return none

    const discountAmount = round2(pointsToRedeem / settings.redemption.redeemRatePerCurrencyUnit)
    return { pointsToRedeem, discountAmount }
}

/** Immediately confirmed and negative — spending happens at the moment of order placement. */
export const recordRedemption = async ({ userId, orderId, points, session }) => {
    const now = Date.now()
    const debit = -Math.abs(points)
    const [tx] = await pointsTransactionModel.create([{
        userId: String(userId),
        type: 'redemption',
        points: debit,
        status: 'confirmed',
        confirmedAt: now,
        sourceOrderId: String(orderId),
        date: now,
        note: 'Points redeemed at checkout',
    }], { session })

    await userModel.findByIdAndUpdate(userId, { $inc: { pointsBalance: debit } }, { session })

    return tx
}

// ─────────────────────────────────────────────────────────────────────────────
// Vesting: confirm on delivery, reverse on cancel/refund
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Called from updateStatus on the genuine first forward transition into
 * Delivered. No extra idempotency guard is needed here beyond this
 * function's own `status: 'pending'` filter — buildStatusTransition already
 * returns `changed: false` for a repeated same-status call (the exact
 * mechanism that already protects the shipped/delivered emails from
 * double-send), so this only ever runs once per order's real transition.
 * Never throws: this must not fail an admin's fulfilment click.
 */
export const confirmOrderBonuses = async (orderId) => {
    try {
        return await runInTransaction(async (session) => {
            const pending = await pointsTransactionModel.find(
                { sourceOrderId: String(orderId), status: 'pending' },
            ).session(session)
            if (pending.length === 0) return { confirmed: 0 }

            const now = Date.now()
            await pointsTransactionModel.updateMany(
                { sourceOrderId: String(orderId), status: 'pending' },
                { $set: { status: 'confirmed', confirmedAt: now } },
                { session },
            )

            const totalsByUser = new Map()
            for (const row of pending) {
                totalsByUser.set(row.userId, (totalsByUser.get(row.userId) || 0) + row.points)
            }
            for (const [userId, total] of totalsByUser) {
                await userModel.findByIdAndUpdate(userId, { $inc: { pointsBalance: total } }, { session })
            }

            return { confirmed: pending.length }
        })
    } catch (error) {
        console.log('[bonus] confirmOrderBonuses failed for order', String(orderId), error.message)
        return { confirmed: 0, reason: 'exception' }
    }
}

/**
 * The single reversal path for both "still pending" (void, no balance
 * change — it never counted) and "already confirmed" (a sign-flipped
 * clawback row, balance can go negative on purpose — it represents "you owe
 * these back"). Used by order cancellation, refund, and a failed/abandoned
 * payment after redemption had already debited points. Never throws.
 */
export const reverseOrder = async (orderId, reason = '') => {
    try {
        return await runInTransaction(async (session) => {
            const rows = await pointsTransactionModel.find({
                sourceOrderId: String(orderId),
                status: { $in: ['pending', 'confirmed'] },
            }).session(session)
            if (rows.length === 0) return { voided: 0, clawedBack: 0 }

            const now = Date.now()
            let voided = 0
            let clawedBack = 0

            for (const row of rows) {
                if (row.status === 'pending') {
                    await pointsTransactionModel.findByIdAndUpdate(row._id, {
                        $set: { status: 'voided', voidedAt: now, voidReason: reason },
                    }, { session })
                    voided += 1
                    continue
                }

                // Guard against reversing the same confirmed row twice (e.g.
                // cancel endpoint called twice in a row).
                const alreadyReversed = await pointsTransactionModel.exists(
                    { relatedTransactionId: row._id },
                ).session(session)
                if (alreadyReversed) continue

                const flipped = -row.points
                await pointsTransactionModel.create([{
                    userId: row.userId,
                    type: 'clawback',
                    points: flipped,
                    status: 'confirmed',
                    confirmedAt: now,
                    sourceOrderId: row.sourceOrderId,
                    relatedTransactionId: row._id,
                    date: now,
                    note: reason || 'Order cancelled/refunded',
                }], { session })

                await userModel.findByIdAndUpdate(row.userId, { $inc: { pointsBalance: flipped } }, { session })
                clawedBack += 1
            }

            return { voided, clawedBack }
        })
    } catch (error) {
        console.log('[bonus] reverseOrder failed for order', String(orderId), error.message)
        return { voided: 0, clawedBack: 0, reason: 'exception' }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Reads
// ─────────────────────────────────────────────────────────────────────────────

export const getBalance = async (userId) => {
    const [user, pendingAgg] = await Promise.all([
        userModel.findById(userId).select('pointsBalance'),
        pointsTransactionModel.aggregate([
            { $match: { userId: String(userId), status: 'pending' } },
            { $group: { _id: null, total: { $sum: '$points' } } },
        ]),
    ])
    return {
        confirmed: user?.pointsBalance || 0,
        pending: pendingAgg[0]?.total || 0,
    }
}

export const getHistory = async (userId, { page = 1, limit = 20 } = {}) => {
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100)
    const safePage = Math.max(Number(page) || 1, 1)
    const filter = { userId: String(userId) }
    const [rows, total] = await Promise.all([
        pointsTransactionModel.find(filter).sort({ date: -1 }).skip((safePage - 1) * safeLimit).limit(safeLimit),
        pointsTransactionModel.countDocuments(filter),
    ])
    return { rows, total, page: safePage, limit: safeLimit }
}

/** Admin ledger view across all users, mirrors allOrders' pagination shape. */
export const getAdminTransactions = async ({ page = 1, limit = 50, userId, type, status } = {}) => {
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200)
    const safePage = Math.max(Number(page) || 1, 1)
    const filter = {}
    if (userId) filter.userId = String(userId)
    if (isValidTransactionType(type)) filter.type = type
    if (isValidTransactionStatus(status)) filter.status = status

    const [rows, total] = await Promise.all([
        pointsTransactionModel.find(filter).sort({ date: -1 }).skip((safePage - 1) * safeLimit).limit(safeLimit),
        pointsTransactionModel.countDocuments(filter),
    ])
    return { rows, total, page: safePage, limit: safeLimit }
}

/**
 * Drift-correction admin utility: recompute pointsBalance from
 * Σ(confirmed points). A manual safety net rather than a periodic job,
 * precisely because there is no cron/queue in this app to run one.
 */
export const recalculateBalance = async (userId) => {
    const agg = await pointsTransactionModel.aggregate([
        { $match: { userId: String(userId), status: 'confirmed' } },
        { $group: { _id: null, total: { $sum: '$points' } } },
    ])
    const total = agg[0]?.total || 0
    await userModel.findByIdAndUpdate(userId, { $set: { pointsBalance: total } })
    return total
}
