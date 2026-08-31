/**
 * Production player audit — does the video actually play, not just mount?
 *
 *   node scripts/audit-player.mjs
 */
import { chromium } from 'playwright'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const API = 'https://video-monetization-platform-production.up.railway.app'
const APP = 'https://video-monetization-platform-chi.vercel.app'
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'tmp-player-audit')

const slugs = [
  'how-to-cook-pilau-properly',
  'studio-session-track-4',
  'ugali-samaki-sunday-cooking',
  'live-at-arusha-full-set',
  'whatsapp-video-2026-08-15-at-11-50-34-pm',
]

function decodeJwt(token) {
  try {
    const payload = token.split('.')[1]
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

async function fetchJson(url) {
  const res = await fetch(url)
  const build = res.headers.get('x-build')
  const json = await res.json().catch(() => ({}))
  return { status: res.status, build, json }
}

async function probeIframe(iframe, referer) {
  const res = await fetch(iframe, {
    headers: referer ? { Referer: referer, Origin: new URL(referer).origin } : {},
    redirect: 'follow',
  })
  const text = await res.text()
  return {
    status: res.status,
    type: res.headers.get('content-type'),
    bytes: text.length,
    looksLikePlayer: /cloudflare|stream|video|iframe/i.test(text.slice(0, 2000)),
    errorHint: (text.match(/not allowed|blocked|origin|403|unauthorized|expired/i) || [])[0] || null,
  }
}

async function auditPage(browser, slug, viewport, label) {
  const page = await browser.newPage({ viewport })
  const consoleErr = []
  const pageErr = []
  const failed = []
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErr.push(m.text().slice(0, 220))
  })
  page.on('pageerror', (e) => pageErr.push(String(e).slice(0, 220)))
  page.on('requestfailed', (r) => {
    const u = r.url()
    if (/videodelivery|cloudflarestream|iframe\.video/.test(u)) {
      failed.push(`${r.failure()?.errorText || 'fail'} ${u.slice(0, 90)}`)
    }
  })

  await page.addInitScript(() => {
    try {
      localStorage.clear()
      sessionStorage.clear()
    } catch {
      /* ignore */
    }
  })

  await page.goto(`${APP}/watch/${slug}`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.waitForTimeout(8000)

  const ad = await page.locator('.ad-stage').count()
  const adState = ad ? await page.locator('.ad-stage').getAttribute('data-ad-state') : null
  const empty = await page.locator('.player-empty').innerText().catch(() => '')
  const iframeCount = await page.locator('.player iframe.stream-frame').count()
  const shell = page.locator('.player .stream-shell').first()
  const box = (await shell.boundingBox().catch(() => null)) || { width: 0, height: 0 }
  const ready = await page.locator('.player .stream-shell.is-ready').count()
  const boot = ((await page.locator('.stream-boot-msg').textContent().catch(() => '')) || '').trim()
  const timeoutOverlay = await page.locator('.stream-fallback-overlay').count()
  const gesture = await page.locator('.stream-gesture').count()

  // Try to start playback if a play control is ours; Stream's own button is inside the iframe.
  if (gesture) await page.locator('.stream-gesture').click().catch(() => {})

  await page.waitForTimeout(2500)

  mkdirSync(OUT, { recursive: true })
  const shot = join(OUT, `${label}-${slug}.png`)
  await page.locator('.player').screenshot({ path: shot }).catch(async () => {
    await page.screenshot({ path: shot, fullPage: false })
  })

  const result = {
    slug,
    label,
    url: page.url(),
    ad,
    adState,
    empty: empty.slice(0, 120),
    iframeCount,
    ready,
    boot,
    timeoutOverlay,
    gesture,
    frame: { w: Math.round(box.width), h: Math.round(box.height) },
    consoleErr: consoleErr.slice(0, 8),
    pageErr: pageErr.slice(0, 5),
    failed: failed.slice(0, 8),
    shot,
  }
  await page.close()
  return result
}

const now = Math.floor(Date.now() / 1000)
console.log('\n=== API / tokens ===')
const health = await fetchJson(`${API}/api/videos?limit=20`)
console.log('X-Build', health.build, 'videos', (health.json.videos || []).length)

for (const slug of slugs) {
  const pb = await fetchJson(`${API}/api/playback/${slug}/playback`)
  const iframe = pb.json?.playback?.iframe || ''
  const token = iframe.split('/').pop()?.split('?')[0] || ''
  const jwt = token.includes('.') ? decodeJwt(token) : null
  let iframeProbe = { status: 'n/a' }
  if (iframe) {
    iframeProbe = await probeIframe(iframe, `${APP}/watch/${slug}`)
  }
  const hls = pb.json?.playback?.hls
  let hlsStatus = null
  if (hls) {
    const r = await fetch(hls, { headers: { Referer: APP } })
    hlsStatus = r.status
  }
  console.log(
    JSON.stringify({
      slug,
      pb: pb.status,
      kind: pb.json?.playback?.kind,
      showsAds: pb.json?.access?.showsAds,
      hasIframe: Boolean(iframe),
      nbf: jwt?.nbf,
      exp: jwt?.exp,
      nbfInPast: jwt ? jwt.nbf <= now : null,
      expInFuture: jwt ? jwt.exp > now : null,
      skewSec: jwt ? jwt.nbf - now : null,
      iframeHttp: iframeProbe,
      hlsStatus,
    })
  )
}

console.log('\n=== UI (live, signed-out Edge) ===')
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const views = [
  { viewport: { width: 1280, height: 900 }, label: 'desktop' },
  { viewport: { width: 390, height: 844 }, label: 'mobile' },
]
for (const view of views) {
  for (const slug of slugs.slice(0, 3)) {
    const row = await auditPage(browser, slug, view.viewport, view.label)
    console.log(JSON.stringify(row, null, 0))
  }
}
await browser.close()
console.log('\nscreenshots:', OUT)
