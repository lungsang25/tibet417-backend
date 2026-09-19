import express from 'express'
import { currentSale, getAdminSale, saveAdminSale, endAdminSale } from '../controllers/saleController.js'
import adminAuth from '../middleware/adminAuth.js'

const saleRouter = express.Router()

// Public: the discount in force right now and which products it covers.
saleRouter.get('/current', currentSale)

// Admin
saleRouter.get('/admin', adminAuth, getAdminSale)
saleRouter.post('/admin/save', adminAuth, saveAdminSale)
saleRouter.post('/admin/end', adminAuth, endAdminSale)

export default saleRouter
