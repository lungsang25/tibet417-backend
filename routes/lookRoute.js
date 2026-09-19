import express from 'express'
import { listLooks, adminListLooks, addLook, updateLook, removeLook } from '../controllers/lookController.js'
import upload from '../middleware/multer.js'
import adminAuth from '../middleware/adminAuth.js'

const lookRouter = express.Router()

// Public: active looks for the homepage "Dive into Style" section.
lookRouter.get('/list', listLooks)

// Admin
lookRouter.get('/admin/list', adminAuth, adminListLooks)
lookRouter.post('/add', adminAuth, upload.single('image'), addLook)
lookRouter.post('/update', adminAuth, updateLook)
lookRouter.post('/remove', adminAuth, removeLook)

export default lookRouter
