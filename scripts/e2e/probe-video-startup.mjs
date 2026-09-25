/**
 * "Video starting" measured end to end on production, with the app's own
 * ?perf=1 instrumentation (console.info('[mtonyo] boot-to-first-frame:
 * Nms')) and the full Cloudflare Stream network timeline alongside it.
 *
 * Written for the client's 2026-09-21 ask ("I want Play -> video starting
 * to feel much faster") and reused for the Sep 23 full regression's video-
 * startup evidence. Pixel 7 profile, CPU throttled 4x, a 150ms/1.6Mbps
 * network — a real mid-tier phone on a so-so connection, not a worst case.
 *
 *   PLAYWRIGHT_MODULE=file:///... E2E_EMAIL=... E2E_PASSWORD=... \
 *   node scripts/e2e/probe-video-startup.mjs
 *   SLUG=ugali-samaki-sunday-cooking WAIT_MS=20000 node scripts/e2e/probe-video-startup.mjs
 */
const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const { chromium, devices } = pw
const BASE = process.env.BASE || 'https://video-monetization-platform-chi.vercel.app'
const API = process.env.API || 'https://video-monetization-platform-production.up.railway.app'
const SLUG = process.env.SLUG || 'live-at-arusha-full-set'
const WAIT_MS = Number(process.env.WAIT_MS || 30000)
const VIEWER = { email: process.env.E2E_EMAIL, password: process.env.E2E_PASSWORD }
if (!VIEWER.email || !VIEWER.password) {
  console.error('E2E_EMAIL / E2E_PASSWORD required — see E2E-ACCOUNTS.md')
  process.exit(2)
}

const s = await (await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...VIEWER, side: 'viewer' }) })).json()

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] })
const ctx = await browser.newContext({ ...devices['Pixel 7'] })
const page = await ctx.newPage()
const cdp = await ctx.newCDPSession(page)
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
await cdp.send('Network.enable')
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 })

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
await page.evaluate((sess) => { try { localStorage.setItem('mtonyo.access', sess.accessToken); if (sess.refreshToken) localStorage.setItem('mtonyo.refresh', sess.refreshToken) } catch {} }, s.session)

const events = []
const t0v = { t: 0 }
page.on('console', (m) => { if (m.text().includes('[mtonyo]')) events.push({ at: Date.now() - t0v.t, kind: 'perf', text: m.text() }) })
page.on('response', (r) => {
  const u = r.url()
  if (/cloudflarestream\.com|videodelivery\.net/.test(u) || /\/api\/(playback|videos|ads)\//.test(u)) {
    events.push({ at: Date.now() - t0v.t, kind: 'net', status: r.status(), url: u.split('?')[0].slice(0, 140) })
  }
})

t0v.t = Date.now()
await page.goto(`${BASE}/watch/${SLUG}?perf=1`, { waitUntil: 'domcontentloaded', timeout: 90000 })
await page.waitForTimeout(WAIT_MS)

console.log(`### ${SLUG} (OWNED, no ad) · Pixel 7 · CPU x4 · 150ms/1.6Mbps · waited ${WAIT_MS}ms`)
for (const e of events) {
  if (e.kind === 'perf') console.log(`  ${String(e.at).padStart(6)}ms  PERF  ${e.text}`)
  else console.log(`  ${String(e.at).padStart(6)}ms  ${e.status}  ${e.url}`)
}
await browser.close()
