import mongoose from 'mongoose'
import {
    ORDER_STATUSES,
    DEFAULT_ORDER_STATUS,
    SUPPORTED_LOCALES,
    DEFAULT_LOCALE,
} from '../constants/orderConstants.js'

/**
 * One entry per status transition, so the customer timeline can say *when*
 * each step happened rather than only which step is current.
 *
 * `at` is epoch ms to match the existing `date` field — this schema has no
 * `timestamps` and the whole app already does `new Date(order.date)`.
 * `_id: false` keeps the array small and the API payload clean.
 */
const statusHistorySchema = new mongoose.Schema({
    status: { type: String, enum: ORDER_STATUSES, required: true },
    at: { type: Number, required: true },
    note: { type: String, default: '', maxlength: 300 },
}, { _id: false })

/**
 * ONE package per order — an embedded object, not an array. If split
 * shipments are ever needed this becomes `shipments: [trackingSchema]`.
 *
 * `carrierName` and `url` are SNAPSHOTS resolved at write time from
 * constants/orderConstants.js. Storing the resolved URL means the storefront
 * needs no knowledge of the carrier registry at all, and an order shipped
 * last year keeps the link that worked last year even if a carrier changes
 * its URL scheme.
 */
const trackingSchema = new mongoose.Schema({
    carrierId: { type: String, default: '' },
    carrierName: { type: String, default: '' },
    number: { type: String, default: '' },
    url: { type: String, default: '' },
    shippedAt: { type: Number, default: null },
    deliveredAt: { type: Number, default: null },
    estimatedDelivery: { type: Number, default: null },
    // Shown to the customer, e.g. "Left at the post office for pickup".
    note: { type: String, default: '', maxlength: 300 },
    updatedAt: { type: Number, default: null },
}, { _id: false })

const orderSchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true },
    items: { type: Array, required: true },
    amount: { type: Number, required: true },
    address: { type: Object, required: true },
    status: {
        type: String,
        required: true,
        enum: ORDER_STATUSES,
        default: DEFAULT_ORDER_STATUS,
        index: true,
    },
    paymentMethod: { type: String, required: true },
    payment: { type: Boolean, required: true, default: false },
    date: { type: Number, required: true, index: true },

    // ── package tracking ────────────────────────────────────────────────────
    tracking: { type: trackingSchema, default: () => ({}) },
    statusHistory: { type: [statusHistorySchema], default: [] },

    /**
     * Which language to write the shipping emails in. Captured at checkout
     * (PlaceOrder.jsx) because the customer's browser language at "Shipped"
     * time is unknowable — that email is sent from an admin click days later.
     */
    locale: { type: String, enum: SUPPORTED_LOCALES, default: DEFAULT_LOCALE },

    /**
     * Send-once markers. Claimed with a conditional $set *before* the send
     * (see maybeNotify in orderController.js) so a double-clicked Save or two
     * admins in two tabs cannot produce two emails.
     */
    notifications: {
        shippedEmailAt: { type: Number, default: null },
        deliveredEmailAt: { type: Number, default: null },
    },

    /**
     * Declared so Mongoose strict mode stops silently discarding them.
     * orderController.js has written these since the Payrexx integration and
     * they have never once persisted, which is why verifyTwint's
     * `if (order.payrexxGatewayId)` branch was dead code.
     */
    payrexxGatewayId: { type: String, default: null },
    payrexxTransactionId: { type: String, default: null },

    // ── Redeemable Bonus Program ────────────────────────────────────────────
    /**
     * Points applied as a discount on this order. `amount` above is already
     * net of `discountAmount` — this block exists purely so the order/receipt
     * can show what happened, not to recompute anything. `transactionId`
     * points at the (confirmed, negative) redemption row in pointsTransaction.
     */
    redemption: {
        pointsRedeemed: { type: Number, default: 0 },
        discountAmount: { type: Number, default: 0 },
        transactionId: { type: mongoose.Schema.Types.ObjectId, default: null },
    },

    /**
     * Purchase points this order earned, as a DISPLAY SNAPSHOT only — the
     * pointsTransaction ledger is the source of truth for whether/when they
     * were actually credited. Mirrors the tracking.carrierName snapshot
     * pattern above: the order can show "you earned 45 points" without any
     * downstream reader needing to know the earn-rate that was active when it
     * was placed.
     */
    pointsEarned: { type: Number, default: 0 },

    /**
     * Deliberately ORTHOGONAL to `status`, exactly like `payment: Boolean`
     * already is — folding a cancelled/refunded state into the linear
     * ORDER_STATUSES array would break statusIndex()'s forward-only semantics
     * that buildStatusTransition/maybeNotify depend on.
     */
    cancellation: {
        status: { type: String, enum: ['none', 'cancelled', 'refunded'], default: 'none' },
        at: { type: Number, default: null },
        reason: { type: String, default: '', maxlength: 300 },
    },
})

const orderModel = mongoose.models.order || mongoose.model('order', orderSchema)
export default orderModel;
