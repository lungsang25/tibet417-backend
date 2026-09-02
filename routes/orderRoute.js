import express from 'express'
import {
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
    verifyStripe,
    verifyTwint,
} from '../controllers/orderController.js'
import adminAuth  from '../middleware/adminAuth.js'
import authUser from '../middleware/auth.js'
// The Payrexx webhook below used orderModel and userModel without importing
// them, so every confirmed webhook threw ReferenceError, was swallowed by the
// catch, and returned 500 — Payrexx has been retrying into a black hole.
import orderModel from '../models/orderModel.js'
import userModel from '../models/userModel.js'

const orderRouter = express.Router()

// Status list + carrier registry for the admin panel's selects.
// GET, not POST like the other admin routes: a pure read with no body, and a
// static list with nothing sensitive in it — same shape as GET /api/product/list.
orderRouter.get('/meta', orderMeta)

// Admin Features
orderRouter.post('/list',adminAuth,allOrders)
orderRouter.post('/status',adminAuth,updateStatus)
orderRouter.post('/tracking',adminAuth,updateTracking)
orderRouter.post('/tracking/clear',adminAuth,clearTracking)

// Payment Features
orderRouter.post('/place',authUser,placeOrder)
orderRouter.post('/stripe',authUser,placeOrderStripe)
orderRouter.post('/twint',authUser,placeOrderTwint)

// User Feature 
orderRouter.post('/userorders',authUser,userOrders)
orderRouter.post('/single',authUser,singleOrder)

// verify payment
orderRouter.post('/verifyStripe',authUser, verifyStripe)
orderRouter.post('/verifyTwint',authUser, verifyTwint)

// Webhook endpoint for Payrexx (no auth required for webhooks)
orderRouter.post('/webhook/payrexx', async (req, res) => {
    try {
        // Payrexx webhook handler
        const { transaction } = req.body;
        
        if (transaction && transaction.status === 'confirmed') {
            const orderId = transaction.referenceId;
            
            if (orderId) {
                await orderModel.findByIdAndUpdate(orderId, { 
                    payment: true,
                    payrexxTransactionId: transaction.id
                });
                
                // Clear user's cart
                const order = await orderModel.findById(orderId);
                if (order) {
                    await userModel.findByIdAndUpdate(order.userId, { cartData: {} });
                }
            }
        }
        
        res.status(200).send('OK');
    } catch (error) {
        console.log('Webhook error:', error);
        res.status(500).send('Error');
    }
});

export default orderRouter
