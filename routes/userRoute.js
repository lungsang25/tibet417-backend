import express from 'express';
import { loginUser, registerUser, adminLogin, googleLogin, getProfile, getMeasurements, updateMeasurements } from '../controllers/userController.js';
import authUser from '../middleware/auth.js';

const userRouter = express.Router();

userRouter.post('/register', registerUser)
userRouter.post('/login', loginUser)
userRouter.post('/admin', adminLogin)
userRouter.post('/google', googleLogin)
userRouter.post('/profile', authUser, getProfile)
userRouter.post('/measurements', authUser, getMeasurements)
userRouter.post('/measurements/update', authUser, updateMeasurements)

export default userRouter;