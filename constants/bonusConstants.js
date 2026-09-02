/**
 * Single source of truth for the Redeemable Bonus Program: the ledger's
 * transaction taxonomy and the admin-editable settings singleton's shape and
 * defaults. Mirrors the pattern in orderConstants.js.
 *
 * Three earning programs (welcome / referral / purchase) plus one spending
 * switch (redemption) — each independently on/off so an admin can, say, keep
 * customers earning points while pausing redemption during a stock-take.
 */

export const POINTS_TRANSACTION_TYPES = [
    'welcome',
    'purchase',
    'referral_referrer',
    'referral_referee',
    'redemption',
    'clawback',
    'admin_adjustment',
]

export const isValidTransactionType = (type) => POINTS_TRANSACTION_TYPES.includes(type)

export const POINTS_TRANSACTION_STATUSES = ['pending', 'confirmed', 'voided']

export const isValidTransactionStatus = (status) => POINTS_TRANSACTION_STATUSES.includes(status)

export const BONUS_SETTINGS_SINGLETON_KEY = 'bonus-settings'

export const BONUS_SETTINGS_SECTIONS = ['welcome', 'referral', 'purchase', 'redemption']

export const isValidSettingsSection = (section) => BONUS_SETTINGS_SECTIONS.includes(section)

/**
 * Seed values only — every one of these is admin-editable at runtime via
 * PUT /api/bonus/admin/settings and never hardcoded again once the singleton
 * document exists. Chosen to be a real but modest incentive at the shop's
 * CHF price points (delivery_fee = 10 CHF, so a typical order is well above
 * the referral program's minimum).
 */
export const BONUS_SETTINGS_DEFAULTS = {
    welcome: {
        active: false,
        points: 500,
    },
    referral: {
        active: false,
        referrerPoints: 1000,
        refereePoints: 500,
        minQualifyingOrderAmount: 20,
    },
    purchase: {
        active: false,
        earnRatePerCurrencyUnit: 1,
        minOrderAmount: 0,
    },
    redemption: {
        active: false,
        redeemRatePerCurrencyUnit: 100,
        maxRedemptionPercent: 50,
        minRedeemPoints: 100,
    },
}
