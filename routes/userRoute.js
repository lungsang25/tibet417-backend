import express from 'express';
import { loginUser, registerUser, adminLogin, googleLogin, getProfile, updatePersonalDetails, getAddress, updateAddress, getMeasurements, updateMeasurements } from '../controllers/userController.js';
import authUser from '../middleware/auth.js';

const userRouter = express.Router();

userRouter.post('/register', registerUser)
userRouter.post('/login', loginUser)
userRouter.post('/admin', adminLogin)
userRouter.post('/google', googleLogin)
userRouter.post('/profile', authUser, getProfile)
userRouter.post('/personal-details/update', authUser, updatePersonalDetails)
userRouter.post('/address', authUser, getAddress)
userRouter.post('/address/update', authUser, updateAddress)
userRouter.post('/measurements', authUser, getMeasurements)
userRouter.post('/measurements/update', authUser, updateMeasurements)

export default userRouter;