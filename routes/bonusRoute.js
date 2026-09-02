import express from 'express'
import {
    bonusMeta,
    getBalance,
    getHistory,
    getReferral,
    getAdminSettings,
    updateAdminSettings,
    adminTransactions,
    adminRecalculateBalance,
} from '../controllers/bonusController.js'
import adminAuth from '../middleware/adminAuth.js'
import authUser from '../middleware/auth.js'

const bonusRouter = express.Router()

// Public: active flags + non-sensitive rates for storefront rendering.
bonusRouter.get('/meta', bonusMeta)

// Customer-facing (auth). POST, not GET, to match this codebase's existing
// convention for authed reads (see /api/order/userorders).
bonusRouter.post('/balance', authUser, getBalance)
bonusRouter.post('/history', authUser, getHistory)
bonusRouter.post('/referral', authUser, getReferral)

// Admin
bonusRouter.get('/admin/settings', adminAuth, getAdminSettings)
bonusRouter.post('/admin/settings', adminAuth, updateAdminSettings)
bonusRouter.post('/admin/transactions', adminAuth, adminTransactions)
bonusRouter.post('/admin/recalculate-balance', adminAuth, adminRecalculateBalance)

export default bonusRouter
