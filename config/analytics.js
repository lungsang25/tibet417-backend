import { BetaAnalyticsDataClient } from '@google-analytics/data'

/**
 * Google Analytics 4 Data API client.
 *
 * Credentials come from environment variables rather than a key file on disk,
 * because the backend runs as a Vercel serverless function — there is no
 * writable, persistent filesystem to point GOOGLE_APPLICATION_CREDENTIALS at,
 * and a service-account key must never be committed to the repo.
 *
 * Two forms are accepted, in this order:
 *
 *   1. GA_CREDENTIALS_JSON — the whole downloaded service-account JSON, either
 *      raw or base64-encoded. Base64 is strongly preferred on Vercel: the raw
 *      JSON contains literal newlines inside private_key, and pasting multiline
 *      values into the dashboard is where most setups quietly break.
 *   2. GA_CLIENT_EMAIL + GA_PRIVATE_KEY — the two fields that actually matter,
 *      pulled out by hand. \n escape sequences are converted to real newlines,
 *      since single-line env vars cannot carry the PEM's line breaks.
 *
 * GA_PROPERTY_ID is the numeric property ID (Admin → Property settings, e.g.
 * "properties/123456789" → 123456789). It is NOT the G-XXXXXXXXXX measurement
 * ID — that one belongs to the storefront's VITE_GA_MEASUREMENT_ID and is
 * rejected below, because confusing the two produces an opaque 400 from the API.
 */

const decodeCredentials = () => {
  const blob = process.env.GA_CREDENTIALS_JSON?.trim()

  if (blob) {
    // A raw JSON blob starts with '{'; anything else is treated as base64.
    const json = blob.startsWith('{') ? blob : Buffer.from(blob, 'base64').toString('utf8')

    let parsed
    try {
      parsed = JSON.parse(json)
    } catch {
      throw new Error('GA_CREDENTIALS_JSON is not valid JSON (or valid base64-encoded JSON)')
    }

    if (!parsed.client_email || !parsed.private_key) {
      throw new Error('GA_CREDENTIALS_JSON is missing client_email or private_key')
    }

    return { client_email: parsed.client_email, private_key: parsed.private_key }
  }

  const client_email = process.env.GA_CLIENT_EMAIL?.trim()
  const private_key = process.env.GA_PRIVATE_KEY

  if (client_email && private_key) {
    return { client_email, private_key: private_key.replace(/\\n/g, '\n') }
  }

  return null
}

/**
 * True when the property ID and credentials are both present. The dashboard
 * calls this to render a "connect analytics" state instead of an error — an
 * unconfigured install is an expected state, not a fault.
 */
export const isAnalyticsConfigured = () => {
  try {
    return Boolean(process.env.GA_PROPERTY_ID?.trim() && decodeCredentials())
  } catch {
    return false
  }
}

// The client holds a cached OAuth token, so it is built once per warm serverless
// instance rather than per request.
let client = null

export const getAnalyticsClient = () => {
  const propertyId = process.env.GA_PROPERTY_ID?.trim()

  if (!propertyId) {
    throw new Error('GA_PROPERTY_ID is not set')
  }

  if (/^G-/i.test(propertyId)) {
    throw new Error(
      `GA_PROPERTY_ID must be the numeric property ID (e.g. 123456789), not the measurement ID "${propertyId}". ` +
        'Find it in GA4 under Admin → Property settings.',
    )
  }

  if (!/^\d+$/.test(propertyId)) {
    throw new Error(`GA_PROPERTY_ID must be numeric, got "${propertyId}"`)
  }

  const credentials = decodeCredentials()
  if (!credentials) {
    throw new Error('No GA credentials found — set GA_CREDENTIALS_JSON, or GA_CLIENT_EMAIL and GA_PRIVATE_KEY')
  }

  if (!client) {
    client = new BetaAnalyticsDataClient({ credentials })
  }

  return { client, property: `properties/${propertyId}` }
}
