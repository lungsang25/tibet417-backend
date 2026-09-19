import { test } from 'node:test'
import assert from 'node:assert/strict'
import { priceOrder, OrderPricingError } from '../utils/orderPricing.js'

const coat = { _id: 'p1', name: 'Winter Coat', price: 100, sizes: ['S', 'M'] }
const scarf = { _id: 'p2', name: 'Scarf', price: 19.9, sizes: ['M'] }
const products = [coat, scarf]
const noSale = { active: false, percentOff: 0, productIds: [] }
const sale50 = { active: true, percentOff: 50, productIds: ['p1'] }

test('without a sale every item is charged its regular price plus delivery', () => {
    const { items, subtotal, amount } = priceOrder({
        items: [{ _id: 'p1', size: 'M', quantity: 2 }, { _id: 'p2', size: 'M', quantity: 1 }],
        products, sale: noSale, deliveryFee: 10,
    })
    assert.equal(subtotal, 219.9)
    assert.equal(amount, 229.9)
    assert.equal(items[0].price, 100)
    assert.equal('originalPrice' in items[0], false)
})

test('only products in the sale are discounted, and the snapshot records it', () => {
    const { items, subtotal, amount } = priceOrder({
        items: [{ _id: 'p1', size: 'S', quantity: 2 }, { _id: 'p2', size: 'M', quantity: 1 }],
        products, sale: sale50, deliveryFee: 10,
    })
    assert.equal(items[0].price, 50)
    assert.equal(items[0].originalPrice, 100)
    assert.equal(items[0].salePercent, 50)
    assert.equal(items[1].price, 19.9) // not in the sale
    assert.equal(subtotal, 119.9)
    assert.equal(amount, 129.9)
})

test('prices and amount sent by the browser are ignored', () => {
    const { items, amount } = priceOrder({
        items: [{ _id: 'p1', size: 'M', quantity: 1, price: 1, name: 'Free coat', amount: 1 }],
        products, sale: noSale, deliveryFee: 10,
    })
    assert.equal(items[0].price, 100)
    assert.equal(items[0].name, 'Winter Coat')
    assert.equal(amount, 110)
})

test('a sale that has not started (or has ended) discounts nothing', () => {
    const scheduled = { active: false, percentOff: 0, productIds: [] } // describeSale output when not live
    const { amount } = priceOrder({ items: [{ _id: 'p1', size: 'M', quantity: 1 }], products, sale: scheduled, deliveryFee: 10 })
    assert.equal(amount, 110)
})

test('ids may arrive as ObjectId-like values and are stored as strings', () => {
    const objectIdLike = { toString: () => 'p1' }
    const { items } = priceOrder({
        items: [{ _id: 'p1', size: 'M', quantity: 1 }],
        products: [{ ...coat, _id: objectIdLike }], sale: noSale, deliveryFee: 0,
    })
    assert.equal(items[0]._id, 'p1')
})

test('bad carts are rejected with a shopper-safe message', () => {
    const price = (items) => () => priceOrder({ items, products, sale: noSale, deliveryFee: 10 })
    assert.throws(price([]), OrderPricingError)
    assert.throws(price(undefined), OrderPricingError)
    assert.throws(price([{ _id: 'nope', size: 'M', quantity: 1 }]), /no longer available/)
    assert.throws(price([{ _id: 'p1', size: 'XL', quantity: 1 }]), /Size XL is not available/)
    assert.throws(price([{ _id: 'p1', size: 'M', quantity: 0 }]), /Invalid quantity/)
    assert.throws(price([{ _id: 'p1', size: 'M', quantity: -3 }]), /Invalid quantity/)
    assert.throws(price([{ _id: 'p1', size: 'M', quantity: 1.5 }]), /Invalid quantity/)
    assert.throws(price([{ _id: 'p1', size: 'M', quantity: '2' }]), /Invalid quantity/)
    assert.throws(price([null]), OrderPricingError)
})
