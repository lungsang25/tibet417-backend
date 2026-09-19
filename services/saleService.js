import mongoose from 'mongoose'
import saleModel from '../models/saleModel.js'
import productModel from '../models/productModel.js'
import { SALE_SINGLETON_KEY } from '../constants/saleConstants.js'
import { describeSale } from '../utils/salePricing.js'

/** Lazy-create the singleton on first read — no seed script needed. */
export const getSale = async () =>
    saleModel.findOneAndUpdate(
        { singletonKey: SALE_SINGLETON_KEY },
        { $setOnInsert: { singletonKey: SALE_SINGLETON_KEY } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
    )

/** The sale as the storefront and order pricing should see it right now. */
export const getCurrentSale = async (now = Date.now()) => describeSale(await getSale(), now)

/**
 * Start or reschedule the sale. Saving always switches it on — "end sale" is
 * the only way to switch it off — and restarts the timetable from `startAt`.
 */
export const saveSale = async ({ startAt, productIds }) => {
    if (!Number.isFinite(startAt)) throw new Error('A valid start time is required')

    const ids = [...new Set((Array.isArray(productIds) ? productIds : []).map(String))]
    if (ids.length === 0) throw new Error('Select at least one product for the sale')
    if (!ids.every((id) => mongoose.isValidObjectId(id))) throw new Error('Invalid product selected')

    const found = await productModel.find({ _id: { $in: ids } }).select('_id').lean()
    if (found.length !== ids.length) throw new Error('Some selected products no longer exist')

    await getSale()
    return saleModel.findOneAndUpdate(
        { singletonKey: SALE_SINGLETON_KEY },
        { $set: { active: true, startAt, productIds: ids, updatedAt: Date.now() } },
        { new: true },
    )
}

/**
 * Switch the sale off. The start time and product list are kept so an admin
 * can look at what ran (and re-run it), but nothing is discounted any more.
 */
export const endSale = async () => {
    await getSale()
    return saleModel.findOneAndUpdate(
        { singletonKey: SALE_SINGLETON_KEY },
        { $set: { active: false, updatedAt: Date.now() } },
        { new: true },
    )
}
