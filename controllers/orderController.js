import mongoose from "mongoose";
import orderModel from "../models/orderModel.js";
import userModel from "../models/userModel.js";
import Stripe from 'stripe'
import PayrexxAPI from "../utils/payrexx.js"
import {
    ORDER_STATUSES,
    CARRIERS,
    DEFAULT_ORDER_STATUS,
    SHIPPED_STATUS,
    DELIVERED_STATUS,
    isValidStatus,
    statusIndex,
    findCarrier,
    resolveTrackingUrl,
    TRACKING_NUMBER_RE,
    normalizeTrackingNumber,
    normalizeLocale,
} from "../constants/orderConstants.js"
import { sendOrderStatusEmail, isMailConfigured } from "../utils/mailer.js"

// global variables
const currency = 'inr'
const deliveryCharge = 10

// gateway initialize
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

// Initialize Payrexx
const payrexx = new PayrexxAPI(
    process.env.PAYREXX_INSTANCE,
    process.env.PAYREXX_API_SECRET,
    process.env.PAYREXX_ENVIRONMENT || 'sandbox'
);

// Placing orders using COD Method
const placeOrder = async (req,res) => {
    
    try {
        
        const { userId, items, amount, address, locale} = req.body;

        // One timestamp for both `date` and the seeded history entry, so the
        // order list and the timeline can never disagree by a millisecond.
        const now = Date.now()

        const orderData = {
            userId,
            items,
            address,
            amount,
            paymentMethod:"COD",
            payment:false,
            date: now,
            locale: normalizeLocale(locale),
            statusHistory: [{ status: DEFAULT_ORDER_STATUS, at: now, note: '' }],
        }

        const newOrder = new orderModel(orderData)
        await newOrder.save()

        await userModel.findByIdAndUpdate(userId,{cartData:{}})

        res.json({success:true,message:"Order Placed"})


    } catch (error) {
        console.log(error)
        res.json({success:false,message:error.message})
    }

}

// Placing orders using Stripe Method
const placeOrderStripe = async (req,res) => {
    try {
        
        const { userId, items, amount, address, locale} = req.body
        const { origin } = req.headers;

        // One timestamp for both `date` and the seeded history entry, so the
        // order list and the timeline can never disagree by a millisecond.
        const now = Date.now()

        const orderData = {
            userId,
            items,
            address,
            amount,
            paymentMethod:"Stripe",
            payment:false,
            date: now,
            locale: normalizeLocale(locale),
            statusHistory: [{ status: DEFAULT_ORDER_STATUS, at: now, note: '' }],
        }

        const newOrder = new orderModel(orderData)
        await newOrder.save()

        const line_items = items.map((item) => ({
            price_data: {
                currency:currency,
                product_data: {
                    name:item.name
                },
                unit_amount: item.price * 100
            },
            quantity: item.quantity
        }))

        line_items.push({
            price_data: {
                currency:currency,
                product_data: {
                    name:'Delivery Charges'
                },
                unit_amount: deliveryCharge * 100
            },
            quantity: 1
        })

        const session = await stripe.checkout.sessions.create({
            success_url: `${origin}/verify?success=true&orderId=${newOrder._id}`,
            cancel_url:  `${origin}/verify?success=false&orderId=${newOrder._id}`,
            line_items,
            mode: 'payment',
        })

        res.json({success:true,session_url:session.url});

    } catch (error) {
        console.log(error)
        res.json({success:false,message:error.message})
    }
}

// Verify Stripe 
const verifyStripe = async (req,res) => {

    const { orderId, success, userId } = req.body

    try {
        if (success === "true") {
            await orderModel.findByIdAndUpdate(orderId, {payment:true});
            await userModel.findByIdAndUpdate(userId, {cartData: {}})
            res.json({success: true});
        } else {
            await orderModel.findByIdAndDelete(orderId)
            res.json({success:false})
        }
        
    } catch (error) {
        console.log(error)
        res.json({success:false,message:error.message})
    }

}

// Placing orders using Twint via Payrexx
const placeOrderTwint = async (req, res) => {
    try {
        const { userId, items, amount, address, locale } = req.body
        
        // One timestamp for both `date` and the seeded history entry, so the
        // order list and the timeline can never disagree by a millisecond.
        const now = Date.now()

        const orderData = {
            userId,
            items,
            address,
            amount,
            paymentMethod: "Twint",
            payment: false,
            date: now,
            locale: normalizeLocale(locale),
            statusHistory: [{ status: DEFAULT_ORDER_STATUS, at: now, note: '' }],
        }

        const newOrder = new orderModel(orderData)
        await newOrder.save()

        // Create Payrexx Gateway for Twint payment with minimal required fields
        const gatewayData = {
            amount: Math.round(amount * 100), // Convert to cents
            currency: 'CHF',
            successRedirectUrl: `${process.env.FRONTEND_URL}/verify-twint?success=true&orderId=${newOrder._id}`,
            failedRedirectUrl: `${process.env.FRONTEND_URL}/verify-twint?success=false&orderId=${newOrder._id}`,
            cancelRedirectUrl: `${process.env.FRONTEND_URL}/cart`,
            sku: `ORDER-${newOrder._id}`,
            referenceId: newOrder._id.toString(),
            purpose: `Order Payment ${newOrder._id}`,
            preAuthorization: false,
            reservation: 0,
            vatRate: 0
        }

        console.log('Creating Payrexx gateway with data:', gatewayData);

        const gateway = await payrexx.createGateway(gatewayData)

        if (gateway.status === 'success' && gateway.data && gateway.data.length > 0) {
            const gatewayInfo = gateway.data[0]
            
            // Update order with Payrexx gateway ID
            await orderModel.findByIdAndUpdate(newOrder._id, {
                payrexxGatewayId: gatewayInfo.id
            })

            res.json({
                success: true,
                payment: {
                    orderId: newOrder._id.toString(),
                    gatewayId: gatewayInfo.id,
                    paymentUrl: gatewayInfo.link,
                    qrCodeUrl: gatewayInfo.qrCode || null,
                    amount: amount,
                    currency: 'CHF'
                }
            })
        } else {
            // If gateway creation failed, delete the order
            await orderModel.findByIdAndDelete(newOrder._id)
            res.json({ success: false, message: "Failed to create payment gateway" })
        }

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// Verify Twint payment via Payrexx
const verifyTwint = async (req, res) => {
    try {
        const { orderId, success } = req.body

        if (!orderId) {
            return res.json({ success: false, message: "Order ID is required" })
        }

        const order = await orderModel.findById(orderId)
        if (!order) {
            return res.json({ success: false, message: "Order not found" })
        }

        if (success === 'true' || success === true) {
            // Get gateway status from Payrexx to verify payment
            if (order.payrexxGatewayId) {
                try {
                    const gatewayStatus = await payrexx.getGateway(order.payrexxGatewayId)
                    
                    if (gatewayStatus.status === 'success' && gatewayStatus.data && gatewayStatus.data.length > 0) {
                        const gateway = gatewayStatus.data[0]
                        
                        // Check if payment was actually completed
                        if (gateway.status === 'confirmed' || gateway.status === 'authorized') {
                            await orderModel.findByIdAndUpdate(orderId, { 
                                payment: true,
                                payrexxTransactionId: gateway.invoice?.paymentRequestId || null
                            })
                            
                            // Clear user's cart
                            await userModel.findByIdAndUpdate(order.userId, { cartData: {} })
                            
                            res.json({ success: true, message: "Payment verified successfully" })
                        } else {
                            res.json({ success: false, message: "Payment not completed" })
                        }
                    } else {
                        res.json({ success: false, message: "Unable to verify payment status" })
                    }
                } catch (verifyError) {
                    console.log('Payrexx verification error:', verifyError)
                    res.json({ success: false, message: "Payment verification failed" })
                }
            } else {
                res.json({ success: false, message: "No payment gateway ID found" })
            }
        } else {
            // Payment failed or cancelled
            res.json({ success: false, message: "Payment was cancelled or failed" })
        }

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fulfilment: status transitions, package tracking, notifications
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Orders placed before the tracking feature have no statusHistory. `date` is
 * the one timestamp we can always trust, so seed the step it corresponds to
 * and start recording from there rather than running a migration.
 */
const seedHistory = (order) => (
    order.statusHistory?.length
        ? order.statusHistory.map((entry) => ({ status: entry.status, at: entry.at, note: entry.note || '' }))
        : [{ status: DEFAULT_ORDER_STATUS, at: order.date, note: '' }]
)

/**
 * Works out what a status transition should write, without writing anything.
 *
 * The single place a transition is applied, so /status and /tracking cannot
 * drift apart on history, timestamps, or which change earns an email. The
 * caller owns the write and the send, which is what lets a save that changes
 * carrier AND status be one atomic update and one email.
 */
const buildStatusTransition = (order, next, now) => {
    const current = order.status || DEFAULT_ORDER_STATUS
    if (next === current) return { changed: false, set: {}, notify: null }

    const history = seedHistory(order)
    history.push({ status: next, at: now, note: '' })

    const set = { status: next, statusHistory: history }

    // Stamped on FIRST arrival only. An admin bouncing Delivered -> Shipped ->
    // Delivered to undo a misclick must not rewrite the date the parcel
    // actually left the shop.
    if (next === SHIPPED_STATUS && !order.tracking?.shippedAt) {
        set['tracking.shippedAt'] = now
    }
    if (next === DELIVERED_STATUS && !order.tracking?.deliveredAt) {
        set['tracking.deliveredAt'] = now
    }

    // Only a forward move earns an email, so walking a status back to correct
    // a mistake stays silent.
    const forward = statusIndex(next) > statusIndex(current)
    const notify = forward && (next === SHIPPED_STATUS || next === DELIVERED_STATUS) ? next : null

    return { changed: true, set, notify }
}

/**
 * Sends the shipped/delivered email at most once per order per event.
 *
 * Claim-then-send: the marker is written with a conditional $set BEFORE the
 * network call, so a double-clicked Save, a retried request, or two admins in
 * two tabs cannot produce two emails — only the first update matches
 * `{ field: null }` and gets a document back. If the send then fails the claim
 * is released, so the admin can retry by simply saving again.
 *
 * Never throws: a mail outage must not fail the admin's request, and the DB
 * write it follows is already committed.
 */
const maybeNotify = async (order, event) => {
    if (!event) return { sent: false, reason: 'no-event' }

    // Checked BEFORE claiming. Claiming first would burn the send-once marker
    // on an email that was never sent, so every order shipped while mail is
    // switched off would be permanently ineligible once it is switched on.
    if (!isMailConfigured()) {
        console.log(`[notify] mail not configured, skipping ${event} for order ${order._id}`)
        return { sent: false, reason: 'disabled' }
    }

    const field = event === SHIPPED_STATUS
        ? 'notifications.shippedEmailAt'
        : 'notifications.deliveredEmailAt'

    try {
        const claimed = await orderModel.findOneAndUpdate(
            { _id: order._id, [field]: null },
            { $set: { [field]: Date.now() } },
            { new: true },
        )
        if (!claimed) return { sent: false, reason: 'already-sent' }

        const result = await sendOrderStatusEmail({
            order: claimed,
            event: event === SHIPPED_STATUS ? 'shipped' : 'delivered',
        })

        // 'no-recipient' is permanent for this order — the address will not
        // appear later — so releasing the claim would only retry forever.
        // Every other failure is transient and must stay retryable.
        if (!result.sent && result.reason !== 'no-recipient') {
            await orderModel.findByIdAndUpdate(order._id, { $set: { [field]: null } })
        }
        return result
    } catch (error) {
        console.log('[notify] failed for order', String(order._id), error.message)
        return { sent: false, reason: 'exception' }
    }
}

// Status list + carrier registry for the admin panel's selects.
// Public: a static list with nothing sensitive in it, matching
// productRouter.get('/list'). Cached hard because it only changes on deploy.
const orderMeta = async (req, res) => {
    try {
        res.set('Cache-Control', 'public, max-age=86400')
        res.json({
            success: true,
            statuses: ORDER_STATUSES,
            carriers: CARRIERS.map(({ id, name }) => ({ id, name })),
        })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// All Orders data for Admin Panel
const allOrders = async (req, res) => {
    try {
        const limit = Math.min(Math.max(Number(req.body.limit) || 50, 1), 200)
        const page = Math.max(Number(req.body.page) || 1, 1)
        const filter = isValidStatus(req.body.status) ? { status: req.body.status } : {}

        // Sorted server-side, newest first. The admin's client-side .reverse()
        // only ever approximated this — it reversed insertion order, not date —
        // and becomes outright wrong the moment there is more than one page.
        const [orders, total] = await Promise.all([
            orderModel.find(filter).sort({ date: -1 }).skip((page - 1) * limit).limit(limit),
            orderModel.countDocuments(filter),
        ])

        res.json({ success: true, orders, total, page, limit })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// User Order Data For Forntend
const userOrders = async (req,res) => {
    try {
        
        const { userId } = req.body

        const orders = await orderModel.find({ userId }).sort({ date: -1 })
        res.json({success:true,orders})

    } catch (error) {
        console.log(error)
        res.json({success:false,message:error.message})
    }
}

/**
 * One order, for the customer's tracking page and the "Track your package"
 * link in the shipping email.
 *
 * NOTE the ownership check. verifyStripe above takes an orderId straight from
 * the body and flips `payment: true` on it without checking the caller owns
 * it — do not copy that shape. A missing order and someone else's order
 * return the identical response on purpose: distinguishing them would turn
 * this into an oracle for which order ids exist.
 */
const singleOrder = async (req, res) => {
    try {
        const { orderId, userId } = req.body

        if (!mongoose.isValidObjectId(orderId)) {
            return res.json({ success: false, message: 'Order not found' })
        }

        const order = await orderModel.findById(orderId)
        if (!order || String(order.userId) !== String(userId)) {
            return res.json({ success: false, message: 'Order not found' })
        }

        res.json({ success: true, order })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

// update order status from Admin Panel
const updateStatus = async (req,res) => {
    try {
        const { orderId, status } = req.body

        if (!mongoose.isValidObjectId(orderId)) {
            return res.json({ success: false, message: 'Invalid order id' })
        }
        // Previously any string went straight into findByIdAndUpdate, so a
        // single typo could put an order into a state the storefront timeline
        // cannot place and can only render as a raw string.
        if (!isValidStatus(status)) {
            return res.json({ success: false, message: `Unknown status: ${status}` })
        }

        const order = await orderModel.findById(orderId)
        if (!order) return res.json({ success: false, message: 'Order not found' })

        const { changed, set, notify } = buildStatusTransition(order, status, Date.now())
        if (!changed) {
            return res.json({ success: true, message: 'Status unchanged', order })
        }

        const updated = await orderModel.findByIdAndUpdate(
            orderId, { $set: set }, { new: true, runValidators: true },
        )

        // Awaited, not fire-and-forget: on Vercel the instance can be frozen
        // the moment the response flushes, so a detached promise would send
        // reliably in dev and silently never send in production.
        const mail = await maybeNotify(updated, notify)

        res.json({ success: true, message: 'Status Updated', order: updated, emailSent: mail.sent })
    } catch (error) {
        console.log(error)
        res.json({success:false,message:error.message})
    }
}

/**
 * Set or replace the package tracking on an order.
 *
 * Accepts an optional `status` so "record the tracking number AND mark it
 * shipped" is one atomic write and one email — which is the actual admin
 * workflow, and what makes the shipped email able to carry the tracking link.
 */
const updateTracking = async (req, res) => {
    try {
        const { orderId, carrierId, trackingNumber, status, estimatedDelivery, note } = req.body

        if (!mongoose.isValidObjectId(orderId)) {
            return res.json({ success: false, message: 'Invalid order id' })
        }

        const carrier = findCarrier(carrierId)
        if (!carrier) {
            return res.json({ success: false, message: 'Unknown carrier' })
        }

        const number = normalizeTrackingNumber(trackingNumber)
        if (!TRACKING_NUMBER_RE.test(number)) {
            return res.json({
                success: false,
                message: 'Tracking number looks wrong — 5 to 40 letters, digits, spaces, dots or dashes.',
            })
        }

        if (status !== undefined && !isValidStatus(status)) {
            return res.json({ success: false, message: `Unknown status: ${status}` })
        }

        const order = await orderModel.findById(orderId)
        if (!order) return res.json({ success: false, message: 'Order not found' })

        const now = Date.now()
        const eta = Number(estimatedDelivery)

        const set = {
            'tracking.carrierId': carrier.id,
            // Snapshot the display name and resolve the deep link here, so the
            // storefront and every already-sent email need zero knowledge of
            // the carrier registry.
            'tracking.carrierName': carrier.name,
            'tracking.number': number,
            'tracking.url': resolveTrackingUrl(carrier.id, number),
            'tracking.note': typeof note === 'string' ? note.slice(0, 300) : (order.tracking?.note || ''),
            'tracking.estimatedDelivery': Number.isFinite(eta) && eta > 0 ? eta : null,
            'tracking.updatedAt': now,
        }

        let notify = null
        if (status !== undefined) {
            const transition = buildStatusTransition(order, status, now)
            Object.assign(set, transition.set)
            notify = transition.notify
        }

        const updated = await orderModel.findByIdAndUpdate(
            orderId, { $set: set }, { new: true, runValidators: true },
        )

        const mail = await maybeNotify(updated, notify)

        res.json({ success: true, message: 'Tracking saved', order: updated, emailSent: mail.sent })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

/**
 * Remove a mistyped tracking number.
 *
 * Deliberately leaves statusHistory and the shipped/delivered stamps alone:
 * clearing a wrong number is not the same as un-shipping a parcel, and the
 * notification markers stay claimed so this cannot be used to re-send email.
 */
const clearTracking = async (req, res) => {
    try {
        const { orderId } = req.body

        if (!mongoose.isValidObjectId(orderId)) {
            return res.json({ success: false, message: 'Invalid order id' })
        }

        const updated = await orderModel.findByIdAndUpdate(orderId, {
            $set: {
                'tracking.carrierId': '',
                'tracking.carrierName': '',
                'tracking.number': '',
                'tracking.url': '',
                'tracking.note': '',
                'tracking.estimatedDelivery': null,
                'tracking.updatedAt': Date.now(),
            },
        }, { new: true })

        if (!updated) return res.json({ success: false, message: 'Order not found' })

        res.json({ success: true, message: 'Tracking cleared', order: updated })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

export {
    verifyStripe,
    verifyTwint,
    placeOrder,
    placeOrderStripe,
    placeOrderTwint,
    orderMeta,
    allOrders,
    userOrders,
    singleOrder,
    updateStatus,
    updateTracking,
    clearTracking,
}
