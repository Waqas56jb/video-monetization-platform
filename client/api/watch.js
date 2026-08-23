/**
 * /watch/:slug — one HTML for everyone (crawlers and browsers).
 *
 * WhatsApp / Facebook do not run JavaScript. They read the first HTML response.
 * User-Agent sniffing used to send crawlers a tiny document and browsers the SPA
 * shell with generic og:title="MTONYO+" — exactly the broken card the client saw.
 * Now every request gets the SPA shell with per-video Open Graph tags injected.
 */

import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { escapeAttr } from './_lib/ogDocument.js'
import { apiOrigin, publicWebOrigin } from './_lib/apiOrigin.js'
import { startReport, settleReport } from './_lib/report.js'

const BUILD = (process.env.VERCEL_GIT_COMMIT_SHA || 'dev').slice(0, 7)

const API = apiOrigin()
const WEB = publicWebOrigin()

const SLUG_RE = /^[a-z0-9-]+$/
const META_MEMO_MS = 5 * 60 * 1000
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

async function loadShareMeta(slug) {
  const hit = metaMemo.get(slug)
  if (hit && Date.now() - hit.at < META_MEMO_MS) return hit.meta

  let meta = null
  try {
    const r = await fetch(`${API}/api/public/videos/${encodeURIComponent(slug)}/share-meta`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(2500),
    })
    if (r.ok) meta = await r.json()
  } catch {
    /* branded fallback below */
  }

  metaMemo.set(slug, { meta, at: Date.now() })
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
<meta property="og:image:secure_url" content="${escapeAttr(cardUrl)}">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${escapeAttr(`${title} — ${creator || 'MTONYO+'}`)}">
<meta name="twitter:image" content="${escapeAttr(cardUrl)}">`
    : ''

  return `<title>${escapeAttr(title)} — ${escapeAttr(creator || 'MTONYO+')} | MTONYO+</title>
<meta name="description" content="${escapeAttr(description)}">
<meta property="og:type" content="video.other">
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

function fallbackHtml({ slug, started }) {
  const canonical = slug ? `${WEB}/watch/${slug}` : WEB
  const title = 'MTONYO+'
  const description = 'WATCH FREE PREVIEW · MTONYO+'
  const cardUrl = `${API}/api/share-card/fallback.jpg?v=generic`
  const block = buildMetaBlock({ canonical, title, creator: '', description, cardUrl })
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">${block}</head><body><h1>${escapeAttr(title)}</h1></body></html>`
}

export default async function handler(req, res) {
  const started = Date.now()
  const slug = parseSlug(req)
  const ua = req.headers['user-agent'] || ''
  const crawler = detectCrawler(ua)

  const pending = startReport(API, req, { asset: 'html', slug })

  const meta = slug ? await loadShareMeta(slug) : null
  const title = meta?.title || 'MTONYO+'
  const creator = meta?.creator || ''
  const description = creator
    ? `WATCH FREE PREVIEW · ${creator} · MTONYO+`
    : 'WATCH FREE PREVIEW · MTONYO+'
  const canonical = slug ? `${WEB}/watch/${slug}` : WEB
  const cardUrl =
    meta?.cardUrl ||
    (slug ? `${API}/api/share-card/${encodeURIComponent(slug)}.jpg` : `${API}/api/share-card/fallback.jpg`)

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
    res.end(fallbackHtml({ slug, started }))
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
