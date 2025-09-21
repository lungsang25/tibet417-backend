import express from 'express'
import {placeOrder, placeOrderStripe, placeOrderTwint, allOrders, userOrders, updateStatus, verifyStripe, verifyTwint} from '../controllers/orderController.js'
import adminAuth  from '../middleware/adminAuth.js'
import authUser from '../middleware/auth.js'

const orderRouter = express.Router()

// Admin Features
orderRouter.post('/list',adminAuth,allOrders)
orderRouter.post('/status',adminAuth,updateStatus)

// Payment Features
orderRouter.post('/place',authUser,placeOrder)
orderRouter.post('/stripe',authUser,placeOrderStripe)
orderRouter.post('/twint',authUser,placeOrderTwint)

// User Feature 
orderRouter.post('/userorders',authUser,userOrders)

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