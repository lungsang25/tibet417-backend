import orderModel from "../models/orderModel.js";
import userModel from "../models/userModel.js";
import Stripe from 'stripe'
import PayrexxAPI from "../utils/payrexx.js"

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
        
        const { userId, items, amount, address} = req.body;

        const orderData = {
            userId,
            items,
            address,
            amount,
            paymentMethod:"COD",
            payment:false,
            date: Date.now()
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
        
        const { userId, items, amount, address} = req.body
        const { origin } = req.headers;

        const orderData = {
            userId,
            items,
            address,
            amount,
            paymentMethod:"Stripe",
            payment:false,
            date: Date.now()
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
        const { userId, items, amount, address } = req.body
        
        const orderData = {
            userId,
            items,
            address,
            amount,
            paymentMethod: "Twint",
            payment: false,
            date: Date.now()
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

// All Orders data for Admin Panel
const allOrders = async (req,res) => {

    try {
        
        const orders = await orderModel.find({})
        res.json({success:true,orders})

    } catch (error) {
        console.log(error)
        res.json({success:false,message:error.message})
    }

}

// User Order Data For Forntend
const userOrders = async (req,res) => {
    try {
        
        const { userId } = req.body

        const orders = await orderModel.find({ userId })
        res.json({success:true,orders})

    } catch (error) {
        console.log(error)
        res.json({success:false,message:error.message})
    }
}

// update order status from Admin Panel
const updateStatus = async (req,res) => {
    try {
        
        const { orderId, status } = req.body

        await orderModel.findByIdAndUpdate(orderId, { status })
        res.json({success:true,message:'Status Updated'})

    } catch (error) {
        console.log(error)
        res.json({success:false,message:error.message})
    }
}

export {verifyStripe, verifyTwint, placeOrder, placeOrderStripe, placeOrderTwint, allOrders, userOrders, updateStatus}