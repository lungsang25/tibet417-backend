import mongoose from 'mongoose'
import { BONUS_SETTINGS_SINGLETON_KEY, BONUS_SETTINGS_DEFAULTS } from '../constants/bonusConstants.js'

/**
 * One singleton document, not one document per program. The admin settings
 * page reads/writes all four sections in one call, and a config surface this
 * small doesn't earn the ceremony of four separate CRUD documents.
 *
 * Lazily created on first read (see bonusService.getSettings) rather than by
 * a seed script — same "no migrations, backfill at read time" convention as
 * orderController.js's seedHistory().
 */
const bonusSettingsSchema = new mongoose.Schema({
    singletonKey: { type: String, required: true, unique: true, default: BONUS_SETTINGS_SINGLETON_KEY },

    welcome: {
        active: { type: Boolean, default: BONUS_SETTINGS_DEFAULTS.welcome.active },
        points: { type: Number, default: BONUS_SETTINGS_DEFAULTS.welcome.points, min: 0 },
    },

    referral: {
        active: { type: Boolean, default: BONUS_SETTINGS_DEFAULTS.referral.active },
        referrerPoints: { type: Number, default: BONUS_SETTINGS_DEFAULTS.referral.referrerPoints, min: 0 },
        refereePoints: { type: Number, default: BONUS_SETTINGS_DEFAULTS.referral.refereePoints, min: 0 },
        minQualifyingOrderAmount: {
            type: Number,
            default: BONUS_SETTINGS_DEFAULTS.referral.minQualifyingOrderAmount,
            min: 0,
        },
    },

    purchase: {
        active: { type: Boolean, default: BONUS_SETTINGS_DEFAULTS.purchase.active },
        // Points earned per 1 unit of currency spent (delivery fee excluded).
        earnRatePerCurrencyUnit: {
            type: Number,
            default: BONUS_SETTINGS_DEFAULTS.purchase.earnRatePerCurrencyUnit,
            min: 0,
        },
        minOrderAmount: { type: Number, default: BONUS_SETTINGS_DEFAULTS.purchase.minOrderAmount, min: 0 },
    },

    redemption: {
        active: { type: Boolean, default: BONUS_SETTINGS_DEFAULTS.redemption.active },
        // Points required per 1 unit of currency discount. Kept as a separate
        // name (and value) from earnRatePerCurrencyUnit above on purpose —
        // reusing one ambiguous rate for both earning and spending directions
        // is exactly the kind of thing that causes a sign/direction bug later.
        redeemRatePerCurrencyUnit: {
            type: Number,
            default: BONUS_SETTINGS_DEFAULTS.redemption.redeemRatePerCurrencyUnit,
            min: 1,
        },
        maxRedemptionPercent: {
            type: Number,
            default: BONUS_SETTINGS_DEFAULTS.redemption.maxRedemptionPercent,
            min: 0,
            max: 100,
        },
        minRedeemPoints: { type: Number, default: BONUS_SETTINGS_DEFAULTS.redemption.minRedeemPoints, min: 0 },
    },

    updatedAt: { type: Number, default: () => Date.now() },
}, { minimize: false })

const bonusSettingsModel = mongoose.models.bonusSettings || mongoose.model('bonusSettings', bonusSettingsSchema)
export default bonusSettingsModel
