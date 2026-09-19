// The sale steps up on a fixed timetable measured from the admin-set start
// time: stage 0 for the first 24h, stage 1 for the next 24h, and the last stage
// from then on until an admin ends the sale.
export const SALE_STAGES = [25, 50, 75] // percent off, in order
export const SALE_STAGE_MS = 24 * 60 * 60 * 1000

export const SALE_SINGLETON_KEY = 'sale'
