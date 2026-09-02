import { DEFAULT_LOCALE, normalizeLocale } from '../constants/orderConstants.js'

/**
 * Copy for the two transactional emails, in the four site languages.
 *
 * Plain nested strings rather than a template engine: the whole surface is two
 * emails, and pulling a dependency into a serverless bundle to interpolate
 * five placeholders is not worth it. Placeholders are {{double-braced}} and
 * substituted by fill() below.
 *
 * WARNING: there is no equivalent of the storefront's check-i18n-keys.mjs
 * guarding this file, so a key present in one locale and missing in another
 * renders a literal "{{orderNumber}}" into a customer's inbox. Keep the four
 * key sets identical.
 *
 * Tone matches the storefront: formal address (Sie / vous / Lei) and Swiss
 * orthography — "Grösse", "Strasse", never ß.
 */
const COPY = {
    en: {
        shipped: {
            subject: 'Your Tibet417 order {{orderNumber}} is on its way',
            preheader: 'Your parcel has left our workshop in St. Gallen.',
            heading: 'Your order is on its way',
            intro: 'Hello {{firstName}}, your order {{orderNumber}} has been handed over to {{carrierName}}.',
        },
        delivered: {
            subject: 'Your Tibet417 order {{orderNumber}} has been delivered',
            preheader: 'Your parcel has arrived.',
            heading: 'Your order has arrived',
            intro: 'Hello {{firstName}}, your order {{orderNumber}} was delivered on {{deliveredOn}}.',
        },
        carrierLabel: 'Carrier',
        trackingLabel: 'Tracking number',
        etaLabel: 'Estimated delivery',
        cta: 'Track your package',
        viewOrder: 'View your order',
        footer: 'Tibet417 · Bahnhofplatz 5, 9000 St. Gallen · tibet417@gmail.com',
    },
    de: {
        shipped: {
            subject: 'Ihre Tibet417 Bestellung {{orderNumber}} ist unterwegs',
            preheader: 'Ihr Paket hat unser Atelier in St. Gallen verlassen.',
            heading: 'Ihre Bestellung ist unterwegs',
            intro: 'Guten Tag {{firstName}}, Ihre Bestellung {{orderNumber}} wurde {{carrierName}} übergeben.',
        },
        delivered: {
            subject: 'Ihre Tibet417 Bestellung {{orderNumber}} wurde zugestellt',
            preheader: 'Ihr Paket ist angekommen.',
            heading: 'Ihre Bestellung ist angekommen',
            intro: 'Guten Tag {{firstName}}, Ihre Bestellung {{orderNumber}} wurde am {{deliveredOn}} zugestellt.',
        },
        carrierLabel: 'Versanddienst',
        trackingLabel: 'Sendungsnummer',
        etaLabel: 'Voraussichtliche Lieferung',
        cta: 'Sendung verfolgen',
        viewOrder: 'Bestellung ansehen',
        footer: 'Tibet417 · Bahnhofplatz 5, 9000 St. Gallen · tibet417@gmail.com',
    },
    fr: {
        shipped: {
            subject: 'Votre commande Tibet417 {{orderNumber}} est en route',
            preheader: 'Votre colis a quitté notre atelier à St-Gall.',
            heading: 'Votre commande est en route',
            intro: 'Bonjour {{firstName}}, votre commande {{orderNumber}} a été remise à {{carrierName}}.',
        },
        delivered: {
            subject: 'Votre commande Tibet417 {{orderNumber}} a été livrée',
            preheader: 'Votre colis est arrivé.',
            heading: 'Votre commande est arrivée',
            intro: 'Bonjour {{firstName}}, votre commande {{orderNumber}} a été livrée le {{deliveredOn}}.',
        },
        carrierLabel: 'Transporteur',
        trackingLabel: 'Numéro de suivi',
        etaLabel: 'Livraison estimée',
        cta: 'Suivre votre colis',
        viewOrder: 'Voir votre commande',
        footer: 'Tibet417 · Bahnhofplatz 5, 9000 St-Gall · tibet417@gmail.com',
    },
    it: {
        shipped: {
            subject: 'Il suo ordine Tibet417 {{orderNumber}} è in viaggio',
            preheader: 'Il suo pacco ha lasciato il nostro atelier a San Gallo.',
            heading: 'Il suo ordine è in viaggio',
            intro: 'Buongiorno {{firstName}}, il suo ordine {{orderNumber}} è stato consegnato a {{carrierName}}.',
        },
        delivered: {
            subject: 'Il suo ordine Tibet417 {{orderNumber}} è stato consegnato',
            preheader: 'Il suo pacco è arrivato.',
            heading: 'Il suo ordine è arrivato',
            intro: 'Buongiorno {{firstName}}, il suo ordine {{orderNumber}} è stato consegnato il {{deliveredOn}}.',
        },
        carrierLabel: 'Corriere',
        trackingLabel: 'Numero di tracciamento',
        etaLabel: 'Consegna prevista',
        cta: 'Traccia il pacco',
        viewOrder: 'Vedi il tuo ordine',
        footer: 'Tibet417 · Bahnhofplatz 5, 9000 San Gallo · tibet417@gmail.com',
    },
}

const fill = (template, vars) =>
    String(template ?? '').replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '')

/**
 * The customer's own name and the admin's note are the only untrusted values
 * here, but both land inside an HTML document.
 */
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
))

/**
 * Swiss regional tags, not the bare language: the shop ships from St. Gallen,
 * so 'de-CH' (2. September 2026) is right and 'de-DE' is not. Mirrors
 * LOCALE_MAP in the storefront's config/site.js.
 */
const LOCALE_TAG = { en: 'en-CH', de: 'de-CH', fr: 'fr-CH', it: 'it-CH' }

const formatDate = (ms, locale) => {
    if (!ms) return ''
    return new Intl.DateTimeFormat(LOCALE_TAG[locale] || LOCALE_TAG[DEFAULT_LOCALE], {
        dateStyle: 'long',
        timeZone: 'Europe/Zurich',
    }).format(new Date(ms))
}

/**
 * Table-based, inline-styled, 600px wide. Deliberately boring: Outlook has no
 * flexbox and Gmail strips <style> blocks.
 */
const layout = ({ preheader, heading, bodyHtml }) => `<!doctype html>
<html><body style="margin:0;padding:0;background:#FAF9F7;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAF9F7;padding:32px 0;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #E5E2DD;">
<tr><td style="padding:32px;font-family:Helvetica,Arial,sans-serif;color:#1A1A1A;">
<h1 style="margin:0 0 20px;font-size:22px;font-weight:normal;">${esc(heading)}</h1>
${bodyHtml}
</td></tr></table>
</td></tr></table>
</body></html>`

/**
 * Builds { subject, html, text } for one order and one event.
 * `event` is 'shipped' | 'delivered'.
 */
export const buildOrderEmail = ({ order, event, storefrontUrl }) => {
    const locale = normalizeLocale(order.locale)
    const copy = COPY[locale] || COPY[DEFAULT_LOCALE]
    const eventCopy = copy[event]

    const vars = {
        firstName: order.address?.firstName || '',
        orderNumber: `#${String(order._id).slice(-8).toUpperCase()}`,
        carrierName: order.tracking?.carrierName || '',
        trackingNumber: order.tracking?.number || '',
        deliveredOn: formatDate(order.tracking?.deliveredAt, locale),
        eta: formatDate(order.tracking?.estimatedDelivery, locale),
    }

    const orderUrl = `${storefrontUrl}/${locale}/orders/${order._id}`
    // Falls back to the order page when the carrier has no deep link (the
    // 'other' carrier), so the CTA is never a dead button.
    const trackUrl = order.tracking?.url || orderUrl

    const row = (label, value, mono) => `<p style="margin:0 0 6px;font-size:14px;color:#8A8580;">${esc(label)}: <span style="color:#1A1A1A;${mono ? 'font-family:monospace;' : ''}">${esc(value)}</span></p>`

    const rows = [
        vars.carrierName && row(copy.carrierLabel, vars.carrierName),
        vars.trackingNumber && row(copy.trackingLabel, vars.trackingNumber, true),
        vars.eta && row(copy.etaLabel, vars.eta),
        order.tracking?.note && `<p style="margin:16px 0 0;font-size:14px;">${esc(order.tracking.note)}</p>`,
    ].filter(Boolean).join('')

    const bodyHtml = `
<p style="margin:0 0 20px;font-size:15px;line-height:1.6;">${esc(fill(eventCopy.intro, vars))}</p>
${rows}
<p style="margin:28px 0 0;">
  <a href="${trackUrl}" style="display:inline-block;background:#1A1A1A;color:#FAF9F7;text-decoration:none;padding:12px 28px;font-size:14px;">${esc(copy.cta)}</a>
</p>
<p style="margin:16px 0 0;font-size:13px;"><a href="${orderUrl}" style="color:#8A8580;">${esc(copy.viewOrder)}</a></p>
<hr style="border:0;border-top:1px solid #E5E2DD;margin:32px 0 16px;" />
<p style="margin:0;font-size:12px;color:#8A8580;">${esc(copy.footer)}</p>`

    // Every client that refuses HTML still gets a usable email, and a
    // text/plain alternative measurably helps spam scoring.
    const text = [
        fill(eventCopy.intro, vars),
        '',
        vars.carrierName && `${copy.carrierLabel}: ${vars.carrierName}`,
        vars.trackingNumber && `${copy.trackingLabel}: ${vars.trackingNumber}`,
        vars.eta && `${copy.etaLabel}: ${vars.eta}`,
        order.tracking?.note || '',
        '',
        `${copy.cta}: ${trackUrl}`,
        `${copy.viewOrder}: ${orderUrl}`,
        '',
        copy.footer,
    ].filter((line) => line !== false && line !== undefined).join('\n')

    return {
        subject: fill(eventCopy.subject, vars),
        html: layout({ preheader: eventCopy.preheader, heading: eventCopy.heading, bodyHtml }),
        text,
    }
}

/** Exported for the key-parity check in the verification step. */
export const EMAIL_COPY = COPY
