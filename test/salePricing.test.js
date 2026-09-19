import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getSaleStage, applySalePercent, describeSale } from '../utils/salePricing.js'

const HOUR = 60 * 60 * 1000
const START = Date.UTC(2026, 8, 20, 10, 0, 0)

test('no stage before the sale starts', () => {
    assert.equal(getSaleStage(START, START - 1), null)
    assert.equal(getSaleStage(null, START), null)
})

test('first 24h is 25% off', () => {
    assert.deepEqual(getSaleStage(START, START), { stageIndex: 0, percentOff: 25, nextChangeAt: START + 24 * HOUR })
    assert.equal(getSaleStage(START, START + 24 * HOUR - 1).percentOff, 25)
})

test('next 24h is 50% off', () => {
    assert.deepEqual(getSaleStage(START, START + 24 * HOUR), { stageIndex: 1, percentOff: 50, nextChangeAt: START + 48 * HOUR })
    assert.equal(getSaleStage(START, START + 48 * HOUR - 1).percentOff, 50)
})

test('from 48h on it stays at 75% with no next change', () => {
    assert.deepEqual(getSaleStage(START, START + 48 * HOUR), { stageIndex: 2, percentOff: 75, nextChangeAt: null })
    assert.equal(getSaleStage(START, START + 10 * 24 * HOUR).percentOff, 75)
})

test('applySalePercent rounds to whole Rappen, half up', () => {
    assert.equal(applySalePercent(100, 25), 75)
    assert.equal(applySalePercent(100, 50), 50)
    assert.equal(applySalePercent(100, 75), 25)
    // 19.90 * 0.75 = 14.925 exactly → 14.93 (float maths would give 14.92)
    assert.equal(applySalePercent(19.9, 25), 14.93)
    assert.equal(applySalePercent(0, 50), 0)
})

test('describeSale has no next step in the last stage', () => {
    const sale = describeSale({ active: true, startAt: START, productIds: ['a'] }, START + 60 * HOUR)
    assert.equal(sale.percentOff, 75)
    assert.equal(sale.nextChangeAt, null)
    assert.equal(sale.nextPercentOff, null)
})

test('describeSale is inactive when switched off, scheduled, or never configured', () => {
    const cfg = { active: true, startAt: START, productIds: ['a'] }
    assert.equal(describeSale({ ...cfg, active: false }, START + HOUR).active, false)
    assert.equal(describeSale(cfg, START - HOUR).active, false)
    assert.equal(describeSale(null, START).active, false)
    assert.deepEqual(describeSale(cfg, START - HOUR).productIds, [])
})

test('describeSale exposes the current stage, its products and the server clock', () => {
    const sale = describeSale({ active: true, startAt: START, productIds: ['a', 'b'] }, START + 30 * HOUR)
    assert.equal(sale.active, true)
    assert.equal(sale.percentOff, 50)
    assert.equal(sale.stageIndex, 1)
    assert.equal(sale.stageCount, 3)
    assert.equal(sale.nextChangeAt, START + 48 * HOUR)
    assert.equal(sale.nextPercentOff, 75)
    assert.deepEqual(sale.productIds, ['a', 'b'])
    assert.equal(sale.serverNow, START + 30 * HOUR)
})
