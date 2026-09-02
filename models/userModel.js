import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: false },
    googleId: { type: String, required: false },
    picture: { type: String, required: false },
    cartData: { type: Object, default: {} },
    bodyMeasurements: {
        height: { type: Number, required: false },
        weight: { type: Number, required: false },
        chest: { type: Number, required: false },
        waist: { type: Number, required: false },
        hips: { type: Number, required: false },
        inseam: { type: Number, required: false },
        unit: { type: String, default: 'metric' },
        updatedAt: { type: Date, required: false }
    }
}, { minimize: false })

const userModel = mongoose.models.user || mongoose.model('user',userSchema);

export default userModel