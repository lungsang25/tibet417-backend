import { SALE_STAGES, SALE_STAGE_MS } from '../constants/saleConstants.js'

// Pure functions, no DB — the discount is worked out from `now - startAt` every
// time it is needed, because there is no scheduler to flip a flag at the
// 24h/48h marks (see the note at the bottom of services/bonusService.js).
//
// tibet417-frontend/src/utils/sale.js keeps a copy of `applySalePercent`.
// The two must round identically or the price shown would differ from the one
// charged.

/**
 * Which stage a sale that started at `startAt` is in at `now`.
 * Returns null before the start. `nextChangeAt` is null in the last stage,
 * which has no end of its own.
 */
export const getSaleStage = (startAt, now = Date.now()) => {
    if (!Number.isFinite(startAt) || now < startAt) return null
    const lastIndex = SALE_STAGES.length - 1
    const stageIndex = Math.min(Math.floor((now - startAt) / SALE_STAGE_MS), lastIndex)
    return {
        stageIndex,
        percentOff: SALE_STAGES[stageIndex],
        nextChangeAt: stageIndex < lastIndex ? startAt + (stageIndex + 1) * SALE_STAGE_MS : null,
    }
}

/**
 * Discounted price, rounded to whole Rappen. The arithmetic is done in integer
 * cents so a half-cent always rounds up the same way instead of depending on
 * floating-point noise (19.90 * 0.75 is 14.924999… in floats).
 */
export const applySalePercent = (price, percentOff) => {
    const cents = Math.round(price * 100)
    return Math.round((cents * (100 - percentOff)) / 100) / 100
}

/**
 * The public shape of the sale at `now`. `active` is false when the sale is
 * switched off, or scheduled but not started yet — either way the storefront
 * treats it as no sale.
 */
export const describeSale = (sale, now = Date.now()) => {
    const stage = sale?.active ? getSaleStage(sale.startAt, now) : null
    return {
        active: stage !== null,
        percentOff: stage ? stage.percentOff : 0,
        stageIndex: stage ? stage.stageIndex : null,
        stageCount: SALE_STAGES.length,
        nextChangeAt: stage ? stage.nextChangeAt : null,
        // What the price steps down to at nextChangeAt, for "50% off in 05:12".
        nextPercentOff: stage && stage.nextChangeAt !== null ? SALE_STAGES[stage.stageIndex + 1] : null,
        startAt: sale?.startAt ?? null,
        productIds: stage ? [...(sale.productIds ?? [])] : [],
        serverNow: now,
    }
}
