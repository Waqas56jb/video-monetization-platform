/**
 * /watch/:slug — Open Graph HTML for crawlers, SPA shell for browsers.
 *
 * WhatsApp / Facebook do not run JavaScript. They read the first HTML
 * response, then fetch og:image. Two things used to turn that into a plain
 * link:
 *
 *   1. og:image pointed at `/api/share-card/...` on the API host. WhatsApp
 *      often ignores URLs that look like API routes.
 *   2. This function waited 1.5s on share-meta (API cold start) before
 *      sending HTML, and cached a failed fetch for five minutes. The
 *      crawler timed out, or got a generic title, and showed a URL.
 *
 * Crawlers now get a 2 KB document with a same-origin `/og/card/{slug}.jpg`
 * immediately. share-meta is a short race for the real title, never a gate.
 *
 * TWO DOCUMENTS, ONE URL — and that is what `Vary` is for.
 *
 * This function answers `/watch/:slug` with either a 2 KB crawler document or
 * the full SPA shell, and it decides which by reading `Sec-Fetch-Mode` /
 * `Sec-Fetch-Dest` (see `isUnfurlFetch`). Those headers were not in `Vary`, so
 * the Vercel edge stored whichever variant arrived first and served it to
 * everyone for the next five minutes. Reproduced against production, both ways:
 *
 *   unfurl first, then a human taps the link -> the human gets the crawler
 *   document: no `<div id="root">`, no script tag, no app. A dead end, for as
 *   long as the entry lives.
 *
 *   human first, then WhatsApp Web unfurls -> the unfurl gets the React shell
 *   and has to find og: tags inside it.
 *
 * So every response below declares the full set of headers this handler
 * branches on. The crawler document additionally gets a much shorter edge life
 * than the shell: they are not equally safe to hold. A stale shell still boots
 * the app for whoever receives it; a stale crawler document is a broken page.
 */

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  crawlerDocument,
  escapeAttr,
  isLinkPreviewBot,
  isUnfurlFetch,
  previewCopy,
} from './_lib/ogDocument.js'
import { apiOrigin, publicWebOrigin } from './_lib/apiOrigin.js'
import { startReport, settleReport } from './_lib/report.js'

const BUILD = (process.env.VERCEL_GIT_COMMIT_SHA || 'dev').slice(0, 7)

const API = apiOrigin()
const WEB = publicWebOrigin()

const SLUG_RE = /^[a-z0-9-]+$/
const META_MEMO_MS = 5 * 60 * 1000
const CRAWLER_META_MS = 600
/**
 * A browser waits for the real title too — but for a fraction of the time.
 *
 * This used to be `memoedShareMeta` alone: no network at all for a browser, on
 * the reasoning that the SPA sets its own title and og: tags are for machines.
 * Both halves of that are true and it still left a hole. Not every machine that
 * reads og: tags announces itself: iMessage, Signal and several scrapers send a
 * browser-shaped User-Agent AND `Sec-Fetch-Mode: navigate`, so they land in the
 * branch below and are handed whatever this instance happened to know. On a cold
 * instance that is `titleFromSlug()` — a de-hyphenated slug and no creator.
 *
 * So the browser path asks as well, with a budget small enough that a cold API
 * cannot hold the first byte for long. The memo means a warm instance pays
 * nothing, and the negative memo below means a *down* API is paid for once
 * rather than on every request.
 */
const BROWSER_META_MS = 350
/** How long a failed share-meta lookup is remembered, so an outage costs once. */
const META_MISS_MS = 30 * 1000
const metaMemo = new Map()
const metaMiss = new Map()

/**
 * Everything this handler branches on, declared so a shared cache keys on it.
 *
 * `isUnfurlFetch` reads `Sec-Fetch-Dest` and `Sec-Fetch-Mode`; `Sec-Fetch-Site`
 * is included because a cross-site fetch is the shape an unfurl arrives in and
 * a same-origin one never is, so an intermediary that normalises the first two
 * still cannot merge the variants. `User-Agent` stays for `isLinkPreviewBot`.
 *
 * One string, used by every response, because the failure mode of this list is
 * a branch quietly not being covered by it.
 */
const VARY = 'Sec-Fetch-Dest, Sec-Fetch-Mode, Sec-Fetch-Site, User-Agent, Accept-Encoding'

/**
 * A crawler document is cheap to rebuild and dangerous to keep.
 *
 * If the variant separation above ever fails again — a CDN that drops Vary, an
 * intermediary that does not forward Sec-Fetch-* — this is what bounds the
 * damage: a minute, not five. The shell keeps the longer life because a shell
 * served to a crawler is merely suboptimal, while a crawler document served to
 * a person is a page with no application in it.
 */
const CRAWLER_CACHE = 'public, s-maxage=60, stale-while-revalidate=300'
const SHELL_CACHE_CONTROL = 'public, s-maxage=300, stale-while-revalidate=86400'

let shellCache = null

function loadShell() {
  if (shellCache) return shellCache
  const candidates = [
    join(process.cwd(), 'dist', 'index.html'),
    join(process.cwd(), 'client', 'dist', 'index.html'),
  ]
  for (const path of candidates) {
    if (!existsSync(path)) continue
    try {
      shellCache = readFileSync(path, 'utf8')
      return shellCache
    } catch {
      /* try next */
    }
  }
  return null
}

function parseSlug(req) {
  const raw = String(req.query?.slug || '')
    .split('?')[0]
    .replace(/\/$/, '')
    .trim()
  return SLUG_RE.test(raw) ? raw : null
}

function detectCrawler(ua) {
  if (/WhatsApp/i.test(ua)) {
    if (/WhatsApp\/[\d.]+\s+A/i.test(ua)) return 'whatsapp-android'
    if (/WhatsApp\/[\d.]+\s+I/i.test(ua)) return 'whatsapp-ios'
    return 'whatsapp-web'
  }
  if (/facebookexternalhit|Facebot/i.test(ua)) return 'facebook'
  if (/Twitterbot/i.test(ua)) return 'twitter'
  if (/LinkedInBot/i.test(ua)) return 'linkedin'
  if (/TelegramBot/i.test(ua)) return 'telegram'
  if (/(Googlebot|bingbot|Applebot)/i.test(ua)) return 'other-bot'
  return 'human'
}

function titleFromSlug(slug) {
  const words = String(slug || '')
    .split('-')
    .filter(Boolean)
  if (!words.length) return 'MTONYO+'
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

function ogCardUrl(slug, sourceKey) {
  if (!slug) return null
  const base = `${WEB}/og/card/${encodeURIComponent(slug)}.jpg`
  return sourceKey ? `${base}?v=${encodeURIComponent(sourceKey)}` : base
}

/**
 * What this instance already knows about a slug. Never a network call.
 *
 * This is the hot path for both documents: a warm instance answers from here
 * and spends nothing. `loadShareMeta` consults it first and only reaches the
 * API on a miss.
 */
function memoedShareMeta(slug) {
  const hit = metaMemo.get(slug)
  return hit && Date.now() - hit.at < META_MEMO_MS ? hit.meta : null
}

/** A lookup that just failed is not worth repeating on the next request. */
function recentlyMissed(slug) {
  const at = metaMiss.get(slug)
  return Boolean(at && Date.now() - at < META_MISS_MS)
}

async function loadShareMeta(slug, timeoutMs) {
  const hit = memoedShareMeta(slug)
  if (hit) return hit
  /* The API is not answering for this slug. Do not spend the budget again —
     the document below is complete without it, only less specific. */
  if (recentlyMissed(slug)) return null

  let meta = null
  try {
    const r = await fetch(`${API}/api/public/videos/${encodeURIComponent(slug)}/share-meta`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (r.ok) meta = await r.json()
  } catch {
    /* crawler HTML still goes out with the slug card URL */
  }

  if (meta) {
    metaMemo.set(slug, { meta, at: Date.now() })
    metaMiss.delete(slug)
  } else {
    metaMiss.set(slug, Date.now())
  }
  return meta
}

function stripHeadMeta(html) {
  return html
    .replace(/<title>[\s\S]*?<\/title>/gi, '')
    .replace(/<meta[^>]*\bproperty=["']og:[^"']+["'][^>]*>/gi, '')
    .replace(/<meta[^>]*\bname=["'](twitter:|description)[^"']*["'][^>]*>/gi, '')
    .replace(/<link[^>]*\brel=["']canonical["'][^>]*>/gi, '')
    .replace(/<meta[^>]*\bname=["']twitter:[^"']*["'][^>]*>/gi, '')
}

/**
 * `Title — Creator | MTONYO+`, and never `Title — MTONYO+ | MTONYO+`.
 *
 * The creator slot used to fall back to the site name while the suffix appended
 * it unconditionally, so every document without a creator — the whole no-shell
 * branch, and any cold-instance browser response — said MTONYO+ twice. Confirmed
 * live before this change.
 */
function pageTitle(title, creator) {
  const site = 'MTONYO+'
  const by = String(creator || '').trim()
  return by && by !== site ? `${title} — ${by} | ${site}` : `${title} | ${site}`
}

function buildMetaBlock({ canonical, title, creator, description, cardUrl }) {
  const img = cardUrl
    ? `<meta property="og:image" content="${escapeAttr(cardUrl)}">
<meta property="og:image:url" content="${escapeAttr(cardUrl)}">
<meta property="og:image:secure_url" content="${escapeAttr(cardUrl)}">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${escapeAttr(`${title} — ${creator || 'MTONYO+'}`)}">
<meta name="twitter:image" content="${escapeAttr(cardUrl)}">`
    : ''

  return `<title>${escapeAttr(pageTitle(title, creator))}</title>
<meta name="description" content="${escapeAttr(description)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="MTONYO+">
<meta property="og:url" content="${escapeAttr(canonical)}">
<meta property="og:title" content="${escapeAttr(title)}">
<meta property="og:description" content="${escapeAttr(description)}">
${img}
<meta property="og:locale" content="sw_TZ">
<meta property="og:locale:alternate" content="en_US">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeAttr(title)}">
<meta name="twitter:description" content="${escapeAttr(description)}">
<link rel="canonical" href="${escapeAttr(canonical)}">`
}

function fallbackHtml({ slug }) {
  const canonical = slug ? `${WEB}/watch/${slug}` : WEB
  const title = slug ? titleFromSlug(slug) : 'MTONYO+'
  const description = 'WATCH FREE PREVIEW · MTONYO+'
  const cardUrl = ogCardUrl(slug)
  const block = buildMetaBlock({ canonical, title, creator: '', description, cardUrl })
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">${block}</head><body><h1>${escapeAttr(title)}</h1></body></html>`
}

export default async function handler(req, res) {
  const started = Date.now()
  const slug = parseSlug(req)
  const ua = req.headers['user-agent'] || ''
  const crawler = detectCrawler(ua)
  const previewBot = isLinkPreviewBot(ua) || isUnfurlFetch(req)

  const pending = startReport(API, req, { asset: 'html', slug })

  /**
   * Both race for the real title. The crawler is simply allowed to wait longer.
   *
   * The history matters here, because this has been wrong in both directions.
   * It first awaited share-meta for everybody with a 1.5s budget, before a
   * single byte went out, on top of this function's cold start and the API's
   * inside it — and the memo is per-instance, so a cold instance always missed,
   * which is exactly when it hurt most. That was removed, and browsers were
   * given whatever this instance already happened to know.
   *
   * Removing it entirely went too far the other way. `previewBot` is not the
   * same question as "will anything read these og: tags": iMessage, Signal and
   * several scrapers send a browser User-Agent with `Sec-Fetch-Mode: navigate`
   * and land here, where a cold instance had nothing but `titleFromSlug()`.
   *
   * So both ask, and the budget carries the difference — 600ms for a crawler
   * that will render the result, 350ms for a browser that is about to boot an
   * SPA and set its own title anyway. `loadShareMeta` remembers a failure for
   * 30s, so an API that is down is paid for once per instance and not once per
   * request, which is the property the old 1.5s version lacked.
   */
  const meta = slug
    ? await loadShareMeta(slug, previewBot ? CRAWLER_META_MS : BROWSER_META_MS)
    : null
  const title = meta?.title || (slug ? titleFromSlug(slug) : 'MTONYO+')
  const creator = meta?.creator || ''
  const description = creator
    ? `WATCH FREE PREVIEW · ${creator} · MTONYO+`
    : 'WATCH FREE PREVIEW · MTONYO+'
  const canonical = slug ? `${WEB}/watch/${slug}` : WEB
  const cardUrl = ogCardUrl(slug, meta?.sourceKey)

  if (previewBot) {
    const copy = previewCopy({ title, creator: { name: creator } })
    const html = crawlerDocument({
      canonical,
      title: copy.title,
      description: copy.description,
      image: cardUrl,
    })
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', CRAWLER_CACHE)
    res.setHeader('Vary', VARY)
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('X-Build', BUILD)
    res.setHeader('X-Crawler', crawler)
    res.setHeader('X-Doc', 'crawler')
    res.status(200)
    res.end(html)
    console.log(
      `og-html slug=${slug || 'none'} status=200 ms=${Date.now() - started} crawler=${crawler} bytes=${html.length}`
    )
    await settleReport(pending)
    return
  }

  let shell = loadShell()
  if (!shell) {
    try {
      const host = req.headers['x-forwarded-host'] || req.headers.host
      const proto = req.headers['x-forwarded-proto'] || 'https'
      const r = await fetch(`${proto}://${host}/index.html`, {
        headers: { 'x-og-shell': '1' },
        signal: AbortSignal.timeout(4000),
      })
      if (r.ok) shell = await r.text()
    } catch {
      /* use minimal fallback */
    }
  }

  if (!shell) {
    /**
     * The shell could not be read or fetched, so this is a document with no
     * application in it — the same dead end the Vary fix above exists to
     * prevent, arriving by a different road. It must never be stored: a single
     * bad minute on this branch would otherwise be pinned to the edge and
     * served to everyone who taps the link.
     */
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('Vary', VARY)
    res.setHeader('X-Build', BUILD)
    res.setHeader('X-Crawler', crawler)
    res.setHeader('X-Doc', 'fallback')
    res.status(200)
    res.end(fallbackHtml({ slug }))
    await settleReport(pending)
    return
  }

  let html = stripHeadMeta(shell.replace(/<!--[\s\S]*?-->/g, ''))
  const metaBlock = buildMetaBlock({ canonical, title, creator, description, cardUrl })
  html = html.replace(/<head>/i, `<head>\n${metaBlock}`)
  const inject = {
    slug,
    title,
    creator,
    sourceKey: meta?.sourceKey || null,
    cardUrl,
  }
  html = html.replace(
    '</head>',
    `<script>window.__MTONYO_SHARE_META__=${JSON.stringify(inject)}</script>\n</head>`
  )

  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', SHELL_CACHE_CONTROL)
  res.setHeader('Vary', VARY)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('X-Build', BUILD)
  res.setHeader('X-Crawler', crawler)
  res.setHeader('X-Doc', 'shell')
  res.status(200)
  res.end(html)

  console.log(
    `og-html slug=${slug || 'none'} status=200 ms=${Date.now() - started} crawler=${crawler}`
  )
  await settleReport(pending)
}
