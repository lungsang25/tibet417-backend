import express from 'express';
import { loginUser, registerUser, adminLogin, googleLogin, getProfile } from '../controllers/userController.js';
import authUser from '../middleware/auth.js';

const userRouter = express.Router();

userRouter.post('/register', registerUser)
userRouter.post('/login', loginUser)
userRouter.post('/admin', adminLogin)
userRouter.post('/google', googleLogin)
userRouter.post('/profile', authUser, getProfile)

export default userRouter;