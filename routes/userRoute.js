import express from 'express';
import { loginUser, registerUser, adminLogin, googleLogin } from '../controllers/userController.js';

const userRouter = express.Router();

userRouter.post('/register', registerUser)
userRouter.post('/login', loginUser)
userRouter.post('/admin', adminLogin)
userRouter.post('/google', googleLogin)

export default userRouter;