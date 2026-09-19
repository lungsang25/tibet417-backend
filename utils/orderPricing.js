import { applySalePercent } from './salePricing.js'

/** A cart the server refuses to price — the message is safe to show the shopper. */
export class OrderPricingError extends Error {}

const round2 = (n) => Math.round(n * 100) / 100

/**
 * Re-prices an order from the database. The browser tells us WHICH product,
 * size and quantity it wants; every price, and the order total, is worked out
 * here. Nothing price-related in the request is used, so neither a tampered
 * `price`/`amount` nor a sale price the customer merely believes in can end up
 * as the amount charged.
 *
 * Pure (no DB) so it can be unit-tested; the caller loads `products` (plain
 * objects) and the current `sale` (see saleService.getCurrentSale).
 *
 * Each returned item is the DB product plus `size`/`quantity` — the same
 * snapshot shape orders have always stored — with `price` set to what the
 * customer actually pays per unit. Items that were on sale also carry
 * `originalPrice` and `salePercent`.
 */
export const priceOrder = ({ items, products, sale, deliveryFee }) => {
    if (!Array.isArray(items) || items.length === 0) {
        throw new OrderPricingError('Your cart is empty')
    }

    const byId = new Map(products.map((product) => [String(product._id), product]))
    const saleIds = new Set(sale?.active ? sale.productIds : [])

    let subtotalCents = 0
    const priced = items.map((item) => {
        const product = byId.get(String(item?._id))
        if (!product) {
            throw new OrderPricingError('A product in your cart is no longer available')
        }
        if (!Number.isFinite(product.price) || product.price < 0) {
            throw new OrderPricingError(`"${product.name}" cannot be ordered right now`)
        }

        const { size, quantity } = item
        if (!Number.isInteger(quantity) || quantity < 1) {
            throw new OrderPricingError(`Invalid quantity for "${product.name}"`)
        }
        if (!Array.isArray(product.sizes) || !product.sizes.includes(size)) {
            throw new OrderPricingError(`Size ${size} is not available for "${product.name}"`)
        }

        const onSale = saleIds.has(String(product._id))
        const unitPrice = onSale ? applySalePercent(product.price, sale.percentOff) : product.price
        subtotalCents += Math.round(unitPrice * 100) * quantity

        return {
            ...product,
            _id: String(product._id),
            size,
            quantity,
            price: unitPrice,
            ...(onSale ? { originalPrice: product.price, salePercent: sale.percentOff } : {}),
        }
    })

    const subtotal = subtotalCents / 100
    return { items: priced, subtotal, amount: round2(subtotal + deliveryFee) }
}
