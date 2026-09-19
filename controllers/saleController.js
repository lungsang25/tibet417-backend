import * as saleService from '../services/saleService.js'
import { describeSale } from '../utils/salePricing.js'
import { SALE_STAGES, SALE_STAGE_MS } from '../constants/saleConstants.js'

// Public. The cache is kept to a few seconds so a stage change (or an admin
// ending the sale) reaches shoppers almost immediately.
const currentSale = async (req, res) => {
    try {
        const sale = await saleService.getCurrentSale()
        res.set('Cache-Control', 'public, max-age=5')
        res.json({ success: true, sale })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

const adminPayload = (saleDoc) => ({
    // What the admin configured, whether or not it has started yet...
    config: {
        active: saleDoc.active,
        startAt: saleDoc.startAt,
        productIds: saleDoc.productIds,
    },
    // ...and where the timetable is right now.
    status: describeSale(saleDoc),
    stages: SALE_STAGES,
    stageMs: SALE_STAGE_MS,
})

const getAdminSale = async (req, res) => {
    try {
        const saleDoc = await saleService.getSale()
        res.json({ success: true, ...adminPayload(saleDoc) })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

const saveAdminSale = async (req, res) => {
    try {
        const { startAt, startNow, productIds } = req.body
        // "Start now" is stamped here rather than sent by the browser, so the
        // timetable never depends on the admin's own clock being right.
        const start = startNow ? Date.now() : Number(startAt)
        const saleDoc = await saleService.saveSale({ startAt: start, productIds })
        res.json({ success: true, message: 'Sale saved', ...adminPayload(saleDoc) })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

const endAdminSale = async (req, res) => {
    try {
        const saleDoc = await saleService.endSale()
        res.json({ success: true, message: 'Sale ended', ...adminPayload(saleDoc) })
    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}

export { currentSale, getAdminSale, saveAdminSale, endAdminSale }
