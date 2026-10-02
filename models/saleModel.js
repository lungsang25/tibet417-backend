import mongoose from 'mongoose'
import { SALE_SINGLETON_KEY, SALE_STAGE_MS } from '../constants/saleConstants.js'

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
    // Length of each step in ms; documents saved before this existed read as 24h.
    stageMs: { type: Number, default: SALE_STAGE_MS },
    productIds: { type: [String], default: [] },
    updatedAt: { type: Number, default: 0 },
})

const saleModel = mongoose.models.sale || mongoose.model('sale', saleSchema)

export default saleModel
