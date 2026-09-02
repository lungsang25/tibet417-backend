/**
 * Single source of truth for the order lifecycle and the carrier registry.
 *
 * Before this file existed the five status strings were triplicated across
 * orderModel.js's default, tibet417-admin's status <select>, and the
 * storefront's OrderStatusTimeline — with the backend, the only one that
 * could enforce them, being the one that didn't.
 *
 * MIRRORED BY HAND (both are i18n-bound and cannot import from here):
 *   tibet417-frontend/src/components/OrderStatusTimeline.jsx -> STEPS
 *   tibet417-frontend/src/i18n/locales/{en,de,fr,it}/common.json -> orderStatus.*
 * The admin panel does NOT mirror it — it reads GET /api/order/meta.
 */

export const ORDER_STATUSES = [
    'Order Placed',
    'Packing',
    'Shipped',
    'Out for delivery',
    'Delivered',
]

export const DEFAULT_ORDER_STATUS = 'Order Placed'
export const SHIPPED_STATUS = 'Shipped'
export const DELIVERED_STATUS = 'Delivered'

export const isValidStatus = (status) => ORDER_STATUSES.includes(status)

/** Position in the lifecycle, used to tell a forward move from a correction. */
export const statusIndex = (status) => ORDER_STATUSES.indexOf(status)

export const SUPPORTED_LOCALES = ['en', 'de', 'fr', 'it']
export const DEFAULT_LOCALE = 'en'
export const normalizeLocale = (locale) =>
    SUPPORTED_LOCALES.includes(locale) ? locale : DEFAULT_LOCALE

/**
 * Carriers this shop actually ships with, outbound from St. Gallen.
 *
 * `urlTemplate` is a string rather than a function so the whole array
 * serializes straight to JSON for GET /api/order/meta. `{number}` is
 * substituted with the URL-encoded tracking number.
 *
 * Swiss Post's template is the one Swiss Post documents for merchants:
 * https://www.post.ch/en/business-solutions/digital-commerce/track-consignments-url
 *
 * VERIFY EVERY OTHER LINK BY HAND with a real consignment number before going
 * live — DPD publishes no documented deep-link parameter, so that one is a
 * best guess. A dead link in a transactional email is worse than no link,
 * which is what the 'other' entry below is for.
 */
export const CARRIERS = [
    {
        id: 'swiss-post',
        name: 'Swiss Post',
        urlTemplate: 'https://www.swisspost.ch/swisspost-tracking?formattedParcelCodes={number}',
    },
    {
        id: 'dhl',
        name: 'DHL',
        urlTemplate: 'https://www.dhl.com/ch-en/home/tracking/tracking-parcel.html?submit=1&tracking-id={number}',
    },
    {
        id: 'dpd-ch',
        name: 'DPD Switzerland',
        urlTemplate: 'https://www.dpd.com/ch/en/receive/tracking/?parcelNumber={number}',
    },
    {
        id: 'ups',
        name: 'UPS',
        urlTemplate: 'https://www.ups.com/track?loc=en_CH&tracknum={number}',
    },
    {
        id: 'fedex',
        name: 'FedEx',
        urlTemplate: 'https://www.fedex.com/fedextrack/?trknbr={number}',
    },
    {
        // Escape hatch: a number the customer can quote, with no deep link.
        // Also the fallback whenever a template above turns out to be wrong.
        id: 'other',
        name: 'Other',
        urlTemplate: '',
    },
]

export const findCarrier = (carrierId) =>
    CARRIERS.find((carrier) => carrier.id === carrierId) || null

export const resolveTrackingUrl = (carrierId, number) => {
    const carrier = findCarrier(carrierId)
    if (!carrier || !carrier.urlTemplate || !number) return ''
    return carrier.urlTemplate.replace('{number}', encodeURIComponent(number))
}

/**
 * Deliberately loose. Swiss Post uses 18 digits (often dotted), UPS '1Z' plus
 * 16 alphanumerics, DHL 10-20 digits — a per-carrier regex would start
 * rejecting valid numbers the day a carrier adds a format. This only catches
 * fat-finger input: empty, a single character, a pasted URL.
 */
export const TRACKING_NUMBER_RE = /^[A-Za-z0-9][A-Za-z0-9 .\-_/]{4,39}$/

/** Trim and collapse internal whitespace. Store this, never the raw paste. */
export const normalizeTrackingNumber = (raw) =>
    String(raw ?? '').trim().replace(/\s+/g, ' ')
