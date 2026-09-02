import mongoose from 'mongoose'
import { POINTS_TRANSACTION_TYPES, POINTS_TRANSACTION_STATUSES } from '../constants/bonusConstants.js'

/**
 * Append-only ledger — the source of truth for every point a customer has
 * ever earned or spent. userModel.pointsBalance is a cached sum of the
 * `confirmed` rows here, kept in sync transactionally by bonusService; this
 * collection is what makes "why does this customer have 340 points"
 * answerable, which a bare mutable counter never could be.
 *
 * SIGN CONVENTION: `points` is always the row's net effect on balance once
 * `confirmed`. Earn types (welcome/purchase/referral_*) are positive;
 * redemption and clawback are negative. `confirmed balance = Σ(points where
 * status='confirmed')` needs zero special-casing per type — this is what lets
 * a redemption or a clawback just be "another row" instead of a special path.
 */
const pointsTransactionSchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true },
    type: { type: String, enum: POINTS_TRANSACTION_TYPES, required: true },
    points: { type: Number, required: true },
    status: {
        type: String,
        enum: POINTS_TRANSACTION_STATUSES,
        required: true,
        default: 'pending',
        index: true,
    },

    // The order that caused this row to exist (purchase points, redemption,
    // and the referral pair are all order-triggered). Null for a pure
    // welcome-bonus row.
    sourceOrderId: { type: String, default: null, index: true },

    // The referral counterpart's user id, kept for admin traceability only —
    // never read to compute a balance.
    relatedUserId: { type: String, default: null },

    // Set on a clawback row, pointing back at the confirmed row it reverses.
    relatedTransactionId: { type: mongoose.Schema.Types.ObjectId, default: null },

    note: { type: String, default: '', maxlength: 300 },

    confirmedAt: { type: Number, default: null },
    voidedAt: { type: Number, default: null },
    voidReason: { type: String, default: '' },

    date: { type: Number, required: true, index: true },
})

// Fast "do we already have a row of this type for this order/user" checks —
// the idempotency guards bonusService relies on (no double referral award,
// no double clawback of the same row).
pointsTransactionSchema.index({ sourceOrderId: 1, type: 1, userId: 1 })

const pointsTransactionModel =
    mongoose.models.pointsTransaction || mongoose.model('pointsTransaction', pointsTransactionSchema)
export default pointsTransactionModel
