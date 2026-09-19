import mongoose from 'mongoose'
import { SALE_SINGLETON_KEY } from '../constants/saleConstants.js'

/**
 * One singleton document — there is only ever one sale at a time. Lazily
 * created on first read (see saleService.getSale), same convention as
 * bonusSettingsModel.
 *
 * `startAt` is epoch ms, like every other timestamp in this codebase. Nothing
 * here stores the current discount: that is derived from `startAt` at read
 * time (utils/salePricing.js).
 */
const saleSchema = new mongoose.Schema({
    singletonKey: { type: String, required: true, unique: true, default: SALE_SINGLETON_KEY },
    active: { type: Boolean, default: false },
    startAt: { type: Number, default: null },
    productIds: { type: [String], default: [] },
    updatedAt: { type: Number, default: 0 },
})

const saleModel = mongoose.models.sale || mongoose.model('sale', saleSchema)

export default saleModel
