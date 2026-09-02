import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: false },
    googleId: { type: String, required: false },
    picture: { type: String, required: false },
    cartData: { type: Object, default: {} },
    wishlist: { type: Array, default: [] },
    bodyMeasurements: {
        height: { type: Number, required: false },
        weight: { type: Number, required: false },
        chest: { type: Number, required: false },
        waist: { type: Number, required: false },
        hips: { type: Number, required: false },
        inseam: { type: Number, required: false },
        unit: { type: String, default: 'metric' },
        updatedAt: { type: Date, required: false }
    },

    // ── Redeemable Bonus Program ────────────────────────────────────────────
    // Cached sum of this user's CONFIRMED pointsTransaction rows only — never
    // pending. bonusService keeps this in sync transactionally with the
    // ledger; pointsTransactionModel remains the source of truth.
    pointsBalance: { type: Number, default: 0 },

    // This user's own referral code, generated lazily on first use (either at
    // registration or on first visit to the rewards page) rather than
    // backfilled for every existing account up front.
    referralCode: { type: String, default: null, index: true, sparse: true, unique: true },

    // The referrer's userId, captured once at registration and never mutated
    // afterward — there is no endpoint that changes it, so a referral cannot
    // be retroactively applied or reassigned.
    referredBy: { type: String, default: null },

    // One-shot gate: set the moment this user's referral bonus fires (their
    // first qualifying order), so a second qualifying order never re-fires it.
    referral: {
        convertedAt: { type: Number, default: null },
        convertedOrderId: { type: String, default: null },
    },

    // Idempotency guard so registerUser and googleLogin's new-user branch
    // cannot double-grant the welcome bonus.
    welcomeBonusGrantedAt: { type: Number, default: null },
}, { minimize: false })

const userModel = mongoose.models.user || mongoose.model('user',userSchema);

export default userModel