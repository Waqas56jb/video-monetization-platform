import { query } from '../db/pool.js'

/**
 * Record who asked us for a link preview — every request, not only the ones
 * that announce themselves.
 *
 * This used to drop any request whose User-Agent classified as `human`, on the
 * reasoning that people are most of the traffic and would bury the rows that
 * matter. Four rounds of "sharing from a desktop shows a bare link" were then
 * investigated against a log that, by construction, could not contain the
 * request in question: a desktop WhatsApp client fetching the preview from
 * the user's own machine carries a browser User-Agent, so it was `human`, so
 * it was never written. The absence of a row was read as "WhatsApp never
 * asked", when it could equally have meant "WhatsApp asked and we declined
 * to remember". Everything is kept now. The volume is not a concern on this
 * site, and the edge cache absorbs repeat views before they reach the
 * function at all.
 *
 * Fire and forget, always. A telemetry failure must never change or delay
 * what a crawler is served; that is the whole point of the path being fast.
 */

/** Which client is asking, from the User-Agent. */
export function classifyCrawler(ua = '') {
  const s = String(ua)

  // Meta documents the WhatsApp crawler as `WhatsApp/2.x.x.x` followed by A,
  // I or N for Android, iOS and Web. The in-app browser also carries
  // "WhatsApp" but arrives with a full browser signature, so the browser
  // markers are checked first — that distinction is what stops a person who
  // taps the card being handed the crawler document.
  const isBrowser = /Mozilla|AppleWebKit|Chrome|Safari|Gecko/i.test(s)

  if (/WhatsApp/i.test(s) && !isBrowser) {
    if (/\bA$|\bA[\s;)]/.test(s)) return 'whatsapp-android'
    if (/\bI$|\bI[\s;)]/.test(s)) return 'whatsapp-ios'
    if (/\bN$|\bN[\s;)]/.test(s)) return 'whatsapp-web'
    return 'whatsapp-unknown'
  }
  if (/facebookexternalhit|Facebot/i.test(s)) return 'facebook'
  /* WhatsApp Desktop is an Electron/Catalyst shell: a browser signature with
     "WhatsApp" inside it. Named on its own so it can be counted on its own. */
  if (/WhatsApp/i.test(s) && /Electron/i.test(s)) return 'whatsapp-desktop'
  if (/WhatsApp/i.test(s)) return 'whatsapp-inapp-browser'
  if (/bot|crawler|spider|preview|Twitterbot|TelegramBot|Slackbot|LinkedInBot|Discordbot/i.test(s)) {
    return 'other-bot'
  }
  return 'human'
}

const trim = (v, n) => (v == null ? null : String(v).slice(0, n))

/** Captured headers, as JSON text, bounded — a hostile header must not bloat a row. */
const HEADERS_CAP = 6000
function headersJson(headers) {
  if (headers == null) return null
  try {
    const s = JSON.stringify(headers)
    return s.length > HEADERS_CAP ? JSON.stringify({ _truncated: true, _bytes: s.length }) : s
  } catch {
    return null
  }
}

export function recordCrawlerHit({
  asset,
  slug,
  queryString,
  userAgent,
  status,
  ms,
  cache,
  region,
  method,
  doc,
  ip,
  country,
  city,
  headers,
  build,
  decision,
}) {
  /* A report carrying neither a User-Agent nor a captured request shape says
     nothing about who asked — it is the partial body of a function torn down
     mid-flight. Absorbed, not stored. Every real report has at least one. */
  if (userAgent == null && headers == null) return

  const crawler = classifyCrawler(userAgent)

  query(
    `insert into crawler_hits
       (asset, slug, query, user_agent, crawler, status, ms, cache, region,
        method, doc, ip, country, city, headers, build, decision)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16,$17)`,
    [
      asset,
      trim(slug, 200),
      trim(queryString, 300),
      trim(userAgent, 400),
      crawler,
      status ?? null,
      ms ?? null,
      trim(cache, 20),
      trim(region, 40),
      trim(method, 10),
      trim(doc, 20),
      trim(ip, 64),
      trim(country, 8),
      trim(city, 80),
      headersJson(headers),
      trim(build, 12),
      trim(decision, 60),
    ]
  ).catch(() => {})
}
