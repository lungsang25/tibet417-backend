import express from 'express'
import { analyticsOverview } from '../controllers/analyticsController.js'
import adminAuth from '../middleware/adminAuth.js'

const analyticsRouter = express.Router()

// GET, not POST like the other admin routes: this is a pure read with no body,
// and adminAuth takes its token from the headers either way.
analyticsRouter.get('/overview', adminAuth, analyticsOverview)

export default analyticsRouter
