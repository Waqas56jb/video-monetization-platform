import { query } from '../db/pool.js'

/**
 * Record who asked us for a link preview.
 *
 * Everything we believe about WhatsApp so far comes from reproducing its
 * requests with curl, which tells us what we would answer and nothing about
 * what it actually asks. This records the real thing so the open questions —
 * does it crawl on paste or on send, once or repeatedly, does it re-fetch the
 * image, do A/I/N differ — can be answered from data.
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
  if (/WhatsApp/i.test(s)) return 'whatsapp-inapp-browser'
  if (/bot|crawler|spider|preview|Twitterbot|TelegramBot|Slackbot|LinkedInBot|Discordbot/i.test(s)) {
    return 'other-bot'
  }
  return 'human'
}

const trim = (v, n) => (v == null ? null : String(v).slice(0, n))

export function recordCrawlerHit({ asset, slug, queryString, userAgent, status, ms, cache, region }) {
  const crawler = classifyCrawler(userAgent)

  // Humans are the overwhelming majority of traffic and are not what this is
  // for. Recording them would bury the handful of rows that matter.
  if (crawler === 'human') return

  query(
    `insert into crawler_hits (asset, slug, query, user_agent, crawler, status, ms, cache, region)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
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
    ]
  ).catch(() => {})
}
