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
const BROWSER_META_MS = 1500
const metaMemo = new Map()

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

async function loadShareMeta(slug, timeoutMs) {
  const hit = metaMemo.get(slug)
  if (hit && Date.now() - hit.at < META_MEMO_MS) return hit.meta

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

  if (meta) metaMemo.set(slug, { meta, at: Date.now() })
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

  return `<title>${escapeAttr(title)} — ${escapeAttr(creator || 'MTONYO+')} | MTONYO+</title>
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
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400')
    res.setHeader('Vary', 'User-Agent, Accept-Encoding')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('X-Build', BUILD)
    res.setHeader('X-Crawler', crawler)
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
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 'public, s-maxage=60')
    res.setHeader('X-Build', BUILD)
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
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400')
  res.setHeader('Vary', 'Accept-Encoding')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('X-Build', BUILD)
  res.setHeader('X-Crawler', crawler)
  res.status(200)
  res.end(html)

  console.log(
    `og-html slug=${slug || 'none'} status=200 ms=${Date.now() - started} crawler=${crawler}`
  )
  await settleReport(pending)
}
