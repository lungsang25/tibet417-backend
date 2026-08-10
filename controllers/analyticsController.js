import { getAnalyticsClient, isAnalyticsConfigured } from '../config/analytics.js'

/**
 * GA4 Data API proxy for the admin dashboard.
 *
 * The service-account key can never reach the browser, so the admin app cannot
 * query GA4 directly — it asks this endpoint, which is behind adminAuth.
 *
 * The response shape is the one the dashboard already renders (stats /
 * visitorsOverTime / topPages), so the UI change was a swap of data source
 * rather than a rewrite.
 */

// Windows the dashboard is allowed to request. Whitelisted rather than passed
// through, so a crafted ?days=100000 cannot turn into an expensive GA4 query.
const ALLOWED_RANGES = [7, 28, 90]
const DEFAULT_RANGE = 28

/**
 * GA4 quotas are per-property and per-day (the standard tier allows 25k tokens
 * and 1,250 requests), and every dashboard mount would otherwise burn one. A
 * short TTL keeps a refreshed tab or two admins looking at once from spending
 * quota on numbers that only change hourly anyway.
 *
 * Module-level, so it survives for the life of a warm serverless instance and
 * is simply cold on the first request after a scale-up.
 */
const CACHE_TTL_MS = 5 * 60 * 1000
const cache = new Map()

/** GA4 returns dates as 'YYYYMMDD'; the chart axis wants 'M/D'. */
const formatChartDate = (raw) => `${Number(raw.slice(4, 6))}/${Number(raw.slice(6, 8))}`

/** Seconds → '2m 14s', matching the dashboard's existing column format. */
const formatDuration = (seconds) => {
  const total = Math.round(seconds)
  return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, '0')}s`
}

/**
 * Percentage change against the previous period of equal length.
 *
 * Returns null rather than 0 when the previous period had no data: a property
 * that launched last week has no honest baseline to compare against, and
 * rendering "+0%" there would state something untrue. The dashboard omits the
 * delta when this is null.
 */
const percentChange = (current, previous) => {
  if (!previous) return null
  return Number((((current - previous) / previous) * 100).toFixed(1))
}

const metricValue = (row, index) => Number(row?.metricValues?.[index]?.value || 0)

/**
 * Splits a two-date-range report into [current, previous].
 *
 * When a request carries more than one dateRange, GA4 appends a synthetic
 * 'dateRange' dimension to every row rather than returning parallel result
 * sets, so the rows have to be matched back by that value.
 */
const rowsByDateRange = (report) => {
  const find = (name) =>
    report.rows?.find((row) => row.dimensionValues?.some((dimension) => dimension.value === name))

  return { current: find('date_range_0'), previous: find('date_range_1') }
}

const analyticsOverview = async (req, res) => {
  try {
    if (!isAnalyticsConfigured()) {
      // Not an error: this is how every install looks before GA4 is set up.
      // The dashboard renders setup instructions when configured is false.
      return res.json({
        success: false,
        configured: false,
        message: 'Google Analytics is not configured on the server.',
      })
    }

    const requested = Number(req.query.days)
    const days = ALLOWED_RANGES.includes(requested) ? requested : DEFAULT_RANGE

    const cached = cache.get(days)
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      return res.json({ success: true, configured: true, cached: true, data: cached.data })
    }

    const { client, property } = getAnalyticsClient()

    // Both ranges end 'today', so a freshly installed tag shows numbers within
    // minutes instead of staying empty until tomorrow. Today is a partial day,
    // which the dashboard states next to the range.
    const currentRange = { startDate: `${days - 1}daysAgo`, endDate: 'today' }
    const previousRange = { startDate: `${days * 2 - 1}daysAgo`, endDate: `${days}daysAgo` }

    // One batch instead of three calls: same quota cost per report, but a single
    // round trip and a single auth handshake.
    const [batch] = await client.batchRunReports({
      property,
      requests: [
        {
          dateRanges: [currentRange, previousRange],
          metrics: [
            { name: 'activeUsers' },
            { name: 'sessions' },
            { name: 'screenPageViews' },
            { name: 'bounceRate' },
          ],
        },
        {
          dateRanges: [currentRange],
          dimensions: [{ name: 'date' }],
          metrics: [{ name: 'activeUsers' }],
          orderBys: [{ dimension: { dimensionName: 'date' } }],
        },
        {
          dateRanges: [currentRange],
          dimensions: [{ name: 'pagePath' }],
          metrics: [
            { name: 'screenPageViews' },
            { name: 'userEngagementDuration' },
            { name: 'activeUsers' },
          ],
          orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
          limit: 8,
        },
      ],
    })

    const [totalsReport, timeSeriesReport, pagesReport] = batch.reports
    const { current, previous } = rowsByDateRange(totalsReport)

    const stat = (index, transform = (value) => value) => {
      const now = transform(metricValue(current, index))
      const then = transform(metricValue(previous, index))
      return { value: now, change: percentChange(now, then) }
    }

    const data = {
      stats: {
        users: stat(0, Math.round),
        sessions: stat(1, Math.round),
        pageviews: stat(2, Math.round),
        // GA4 reports bounceRate as a 0–1 ratio, the dashboard prints a percent.
        bounceRate: stat(3, (value) => Number((value * 100).toFixed(1))),
      },

      visitorsOverTime: (timeSeriesReport.rows || []).map((row) => ({
        date: formatChartDate(row.dimensionValues[0].value),
        users: metricValue(row, 0),
      })),

      topPages: (pagesReport.rows || []).map((row) => {
        const views = metricValue(row, 0)
        const engagementSeconds = metricValue(row, 1)
        const users = metricValue(row, 2)

        return {
          path: row.dimensionValues[0].value,
          views,
          // Average engagement time per user, which is how GA4's own Pages
          // report defines the column — not engagement divided by pageviews.
          avgTime: formatDuration(users ? engagementSeconds / users : 0),
        }
      }),

      range: { days, endsToday: true },
      updatedAt: new Date().toISOString(),
    }

    cache.set(days, { at: Date.now(), data })

    res.json({ success: true, configured: true, cached: false, data })
  } catch (error) {
    console.log('Analytics error:', error)

    // The failures every new setup hits, translated into something the admin
    // can act on instead of a raw gRPC status.
    let message = error.message

    if (/DECODER routines|error:1E08010C/.test(error.message)) {
      // The private key was not parseable as PEM. Almost always a single-line
      // GA_PRIVATE_KEY whose \n escapes never became real newlines, or a
      // truncated paste.
      message =
        'The service-account private key could not be parsed. If you set GA_PRIVATE_KEY directly, ' +
        'make sure the \\n sequences survived the paste — using base64 GA_CREDENTIALS_JSON avoids this entirely.'
    } else if (error.code === 7 || error.code === 403) {
      message =
        'The service account does not have access to this GA4 property. ' +
        'Add its client_email as a Viewer under GA4 Admin → Property access management.'
    } else if (error.code === 5 || error.code === 404) {
      // Both IDs are numeric, so this passes validation and only fails here.
      // The data stream page shows a "Stream ID" right next to the measurement
      // ID, and it is not the property ID the Data API addresses.
      message =
        `GA4 property ${process.env.GA_PROPERTY_ID} was not found. Make sure GA_PROPERTY_ID is the ` +
        'Property ID from Admin → Property settings, not the Stream ID from the data stream page.'
    }

    res.json({ success: false, configured: true, message })
  }
}

export { analyticsOverview }
