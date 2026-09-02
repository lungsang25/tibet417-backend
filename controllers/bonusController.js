import * as bonusService from '../services/bonusService.js'
import userModel from '../models/userModel.js'
import { BONUS_SETTINGS_SECTIONS } from '../constants/bonusConstants.js'

// Active flags + the numeric fields the storefront needs to render UI.
// Public and cached hard, same shape as GET /api/order/meta — nothing here
// is sensitive, and it only changes when an admin edits settings.
const bonusMeta = async (req, res) => {
    try {
        const settings = await bonusService.getSettings()
        res.set('Cache-Control', 'public, max-age=60')
        res.json({
            success: true,
            welcome: { active: settings.welcome.active },
            referral: {
                active: settings.referral.active,
                minQualifyingOrderAmount: settings.referral.minQualifyingOrderAmount,
            },
            purchase: {
                active: settings.purchase.active,
                earnRatePerCurrencyUnit: settings.purchase.earnRatePerCurrencyUnit,
            },
            redemption: {
                active: settings.redemption.active,
                redeemRatePerCurrencyUnit: settings.redemption.redeemRatePerCurrencyUnit,
                maxRedemptionPercent: settings.redemption.maxRedemptionPercent,
                minRedeemPoints: settings.redemption.minRedeemPoints,
            },
        })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

const getBalance = async (req, res) => {
    try {
        const { userId } = req.body
        const balance = await bonusService.getBalance(userId)
        res.json({ success: true, ...balance })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

const getHistory = async (req, res) => {
    try {
        const { userId, page, limit } = req.body
        const history = await bonusService.getHistory(userId, { page, limit })
        res.json({ success: true, ...history })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

const getReferral = async (req, res) => {
    try {
        const { userId } = req.body
        const user = await userModel.findById(userId)
        if (!user) return res.json({ success: false, message: 'User not found' })

        const code = await bonusService.ensureReferralCode(user)
        const stats = await bonusService.getReferralStats(userId)
        const storefrontUrl = (process.env.FRONTEND_URL || 'https://www.tibet417.com').replace(/\/+$/, '')

        res.json({
            success: true,
            referralCode: code,
            referralLink: `${storefrontUrl}/?ref=${code}`,
            ...stats,
        })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// ── Admin ───────────────────────────────────────────────────────────────────

const getAdminSettings = async (req, res) => {
    try {
        const settings = await bonusService.getSettings()
        res.json({ success: true, settings })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

const updateAdminSettings = async (req, res) => {
    try {
        const { section, ...patch } = req.body
        if (!BONUS_SETTINGS_SECTIONS.includes(section)) {
            return res.json({ success: false, message: `Unknown settings section: ${section}` })
        }
        const settings = await bonusService.updateSettings(section, patch)
        res.json({ success: true, message: 'Settings saved', settings })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

const adminTransactions = async (req, res) => {
    try {
        const { page, limit, userId, type, status } = req.body
        const result = await bonusService.getAdminTransactions({ page, limit, userId, type, status })
        res.json({ success: true, ...result })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

const adminRecalculateBalance = async (req, res) => {
    try {
        const { userId } = req.body
        if (!userId) return res.json({ success: false, message: 'userId is required' })
        const balance = await bonusService.recalculateBalance(userId)
        res.json({ success: true, message: 'Balance recalculated', pointsBalance: balance })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

export {
    bonusMeta,
    getBalance,
    getHistory,
    getReferral,
    getAdminSettings,
    updateAdminSettings,
    adminTransactions,
    adminRecalculateBalance,
}
