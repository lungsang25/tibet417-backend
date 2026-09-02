import validator from "validator";
import bcrypt from "bcrypt"
import jwt from 'jsonwebtoken'
import { OAuth2Client } from 'google-auth-library'
import userModel from "../models/userModel.js";

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);


const createToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET)
}

// Route for user login
const loginUser = async (req, res) => {
    try {

        const { email, password } = req.body;

        const user = await userModel.findOne({ email });

        if (!user) {
            return res.json({ success: false, message: "User doesn't exists" })
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (isMatch) {

            const token = createToken(user._id)
            res.json({ success: true, token })

        }
        else {
            res.json({ success: false, message: 'Invalid credentials' })
        }

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message })
    }
}

// Route for user register
const registerUser = async (req, res) => {
    try {

        const { name, email, password } = req.body;

        // checking user already exists or not
        const exists = await userModel.findOne({ email });
        if (exists) {
            return res.json({ success: false, message: "User already exists" })
        }

        // validating email format & strong password
        if (!validator.isEmail(email)) {
            return res.json({ success: false, message: "Please enter a valid email" })
        }
        if (password.length < 8) {
            return res.json({ success: false, message: "Please enter a strong password" })
        }

        // hashing user password
        const salt = await bcrypt.genSalt(10)
        const hashedPassword = await bcrypt.hash(password, salt)

        const newUser = new userModel({
            name,
            email,
            password: hashedPassword
        })

        const user = await newUser.save()

        const token = createToken(user._id)

        res.json({ success: true, token })

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message })
    }
}

// Route for admin login
const adminLogin = async (req, res) => {
    try {
        
        const {email,password} = req.body

        if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
            const token = jwt.sign(email+password,process.env.JWT_SECRET);
            res.json({success:true,token})
        } else {
            res.json({success:false,message:"Invalid credentials"})
        }

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message })
    }
}


// Route for Google login
const googleLogin = async (req, res) => {
    try {
        const { credential } = req.body;

        // Verify the Google token
        const ticket = await googleClient.verifyIdToken({
            idToken: credential,
            audience: process.env.GOOGLE_CLIENT_ID
        });

        const payload = ticket.getPayload();
        const { sub: googleId, email, name, picture } = payload;

        // Check if user exists
        let user = await userModel.findOne({ email });

        if (user) {
            // If user exists, update googleId and picture if not set
            if (!user.googleId) {
                user.googleId = googleId;
            }
            if (!user.picture && picture) {
                user.picture = picture;
            }
            await user.save();
        } else {
            // Create new user
            user = new userModel({
                name,
                email,
                googleId,
                picture
            });
            await user.save();
        }

        const token = createToken(user._id);
        res.json({ success: true, token });

    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
}

// Route to get user profile
const getProfile = async (req, res) => {
    try {
        const { userId } = req.body;
        
        const user = await userModel.findById(userId).select('-password -cartData');
        
        if (!user) {
            return res.json({ success: false, message: "User not found" });
        }
        
        res.json({ 
            success: true, 
            user: {
                name: user.name,
                email: user.email,
                picture: user.picture || null,
                googleId: user.googleId ? true : false
            }
        });
        
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
}

// Route to get user body measurements
const getMeasurements = async (req, res) => {
    try {
        const { userId } = req.body;
        
        const user = await userModel.findById(userId).select('bodyMeasurements');
        
        if (!user) {
            return res.json({ success: false, message: "User not found" });
        }
        
        res.json({ 
            success: true, 
            measurements: user.bodyMeasurements || null
        });
        
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
}

// Route to update user body measurements
const updateMeasurements = async (req, res) => {
    try {
        const { userId, measurements } = req.body;
        
        // Validate measurements
        const validFields = ['height', 'weight', 'chest', 'waist', 'hips', 'inseam'];
        const measurementData = {};
        
        for (const field of validFields) {
            if (measurements[field] !== undefined && measurements[field] !== null && measurements[field] !== '') {
                const value = parseFloat(measurements[field]);
                if (isNaN(value) || value <= 0) {
                    return res.json({ success: false, message: `Invalid value for ${field}` });
                }
                measurementData[field] = value;
            }
        }
        
        measurementData.unit = 'metric';
        measurementData.updatedAt = new Date();
        
        const user = await userModel.findByIdAndUpdate(
            userId,
            { bodyMeasurements: measurementData },
            { new: true }
        ).select('bodyMeasurements');
        
        if (!user) {
            return res.json({ success: false, message: "User not found" });
        }
        
        res.json({ 
            success: true, 
            message: "Measurements updated successfully",
            measurements: user.bodyMeasurements
        });
        
    } catch (error) {
        console.log(error);
        res.json({ success: false, message: error.message });
    }
}

export { loginUser, registerUser, adminLogin, googleLogin, getProfile, getMeasurements, updateMeasurements }