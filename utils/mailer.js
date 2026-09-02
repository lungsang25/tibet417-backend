/**
 * Transactional mail over the Resend HTTP API.
 *
 * HTTP rather than SMTP because this runs on Vercel serverless: every
 * invocation would otherwise pay a fresh TCP + TLS + AUTH handshake it cannot
 * pool across frozen instances, and outbound SMTP from cloud egress IPs is the
 * classic works-locally-times-out-in-production failure.
 *
 * No SDK: Node 18+ has global fetch, so this needs zero new dependencies.
 *
 * Swapping providers means rewriting only this file — nothing else in the
 * codebase knows how mail is sent.
 *
 * NOTHING here ever throws. A mail outage must not fail an admin's Save, and
 * the database write it follows is already committed.
 */
import { buildOrderEmail } from './emailTemplates.js'

const RESEND_ENDPOINT = 'https://api.resend.com/emails'
const TIMEOUT_MS = 8000

/**
 * Exported so callers can decide *not* to claim a send-once marker when mail
 * is switched off globally. Mail being disabled is a property of the
 * deployment, not of the order, so an order shipped during a mail-off window
 * must stay eligible for its email once mail is switched back on.
 */
export const isMailConfigured = () =>
    process.env.MAIL_ENABLED !== 'false' && Boolean(process.env.RESEND_API_KEY)

/**
 * On local and preview, MAIL_DEV_REDIRECT forces every message to one inbox.
 * Without it, testing the "delivered" mail against a copy of production data
 * means emailing real customers.
 */
const resolveRecipient = (email) => process.env.MAIL_DEV_REDIRECT || email

export const sendOrderStatusEmail = async ({ order, event }) => {
    if (!isMailConfigured()) {
        console.log(`[mailer] skipped ${event} for order ${order?._id} — mail disabled or RESEND_API_KEY unset`)
        return { sent: false, reason: 'disabled' }
    }

    const to = resolveRecipient(order?.address?.email)
    if (!to) {
        // Orders predating the checkout email field have no recipient. Not
        // worth surfacing to the admin — retrying could never help.
        console.log(`[mailer] no recipient for order ${order?._id}`)
        return { sent: false, reason: 'no-recipient' }
    }

    const storefrontUrl = (process.env.FRONTEND_URL || 'https://www.tibet417.com').replace(/\/+$/, '')
    const { subject, html, text } = buildOrderEmail({ order, event, storefrontUrl })

    // A hung provider must not hold the admin's request open until Vercel's
    // function timeout kills it mid-write.
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

    try {
        const response = await fetch(RESEND_ENDPOINT, {
            method: 'POST',
            signal: controller.signal,
            headers: {
                Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: process.env.MAIL_FROM,
                to: [to],
                reply_to: process.env.MAIL_REPLY_TO || undefined,
                subject,
                html,
                text,
            }),
        })

        if (!response.ok) {
            const body = await response.text().catch(() => '')
            console.log(`[mailer] resend ${response.status} for order ${order._id}: ${body}`)
            return { sent: false, reason: `http-${response.status}` }
        }

        console.log(`[mailer] sent ${event} for order ${order._id} to ${to}`)
        return { sent: true }
    } catch (error) {
        console.log(`[mailer] failed ${event} for order ${order._id}: ${error.message}`)
        return { sent: false, reason: 'exception' }
    } finally {
        clearTimeout(timer)
    }
}
