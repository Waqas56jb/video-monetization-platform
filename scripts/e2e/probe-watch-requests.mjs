/**
 * Every API request one watch page makes over N seconds — anonymous, then as
 * a signed-in viewer — against production, with statuses, the server's own
 * RateLimit header, console errors and failed requests.
 *
 * Written for the client's 2026-09-19 report that "Too many requests" kept
 * appearing on the Nyerere Day video (and elsewhere) after two fixes. It
 * asserts nothing; it shows the page's request flow as a person triggers it.
 * If a page loops, the list shows the loop.
 *
 *   PLAYWRIGHT_MODULE=file:///… E2E_EMAIL=… E2E_PASSWORD=… \
 *   SLUG=nyerere-day-rehearsals-awaiting-review SECONDS=90 node scripts/e2e/probe-watch-requests.mjs
 */
const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const { chromium } = pw
const BASE = process.env.BASE || 'https://video-monetization-platform-chi.vercel.app'
const SLUG = process.env.SLUG || 'nyerere-day-rehearsals-awaiting-review'
const SECONDS = Number(process.env.SECONDS || 90)
const VIEWER = { email: process.env.E2E_EMAIL, password: process.env.E2E_PASSWORD }

const norm = (u) => u.replace(/^https?:\/\/[^/]+/, '').replace(/\?.*$/, '').replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ':id')

const AUTOFILL = (sel, v) => `(() => {
  const el = document.querySelector(${JSON.stringify(sel)})
  if (!el) return false
  const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')
  d && d.set ? d.set.call(el, ${JSON.stringify(v)}) : (el.value = ${JSON.stringify(v)})
  el.dispatchEvent(new Event('input', { bubbles: true }))
  return true
})()`

async function signIn(page) {
  await page.goto(`${BASE}/login?side=viewer`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForSelector('#login-id', { timeout: 40000 })
  await page.waitForTimeout(1000)
  await page.evaluate(AUTOFILL('#login-id', VIEWER.email))
  await page.evaluate(AUTOFILL('#login-pass', VIEWER.password))
  await page.locator('button[type=submit]').first().click({ timeout: 15000 }).catch(() => {})
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(500)
    if (!new URL(page.url()).pathname.startsWith('/login')) return true
  }
  return false
}

for (const mode of ['anonymous', 'signed-in viewer']) {
  if (mode !== 'anonymous' && !VIEWER.email) continue
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  const reqs = []
  const errors = []
  const failed = []
  let t0 = Date.now()
  page.on('response', (r) => {
    const u = r.url()
    if (!/\/api\//.test(u) || /cloudflarestream|videodelivery/.test(u)) return
    reqs.push({ at: Date.now() - t0, m: r.request().method(), p: norm(u), s: r.status(), rl: (r.headers()['ratelimit'] || '').match(/remaining=(\d+)/)?.[1] ?? '' })
  })
  page.on('requestfailed', (r) => failed.push(`${r.method()} ${r.url().slice(0, 120)} — ${r.failure()?.errorText}`))
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 180)) })
  page.on('pageerror', (e) => errors.push(`pageerror: ${String(e).slice(0, 180)}`))

  console.log(`\n### ${mode} · /watch/${SLUG} · ${SECONDS}s`)
  if (mode !== 'anonymous') {
    const ok = await signIn(page)
    console.log(`login: ${ok ? 'ok' : 'FAILED'} (${reqs.length} requests during login, not counted below)`)
    reqs.length = 0
    errors.length = 0
    failed.length = 0
  }
  t0 = Date.now()
  const resp = await page.goto(`${BASE}/watch/${SLUG}`, { waitUntil: 'domcontentloaded', timeout: 90000 }).catch((e) => { errors.push(`goto: ${String(e).split('\n')[0]}`); return null })
  console.log(`document: ${resp ? `${resp.status()} x-doc=${resp.headers()['x-doc'] || '-'} x-build=${resp.headers()['x-build'] || '-'}` : 'FAILED'}`)
  await page.waitForTimeout(SECONDS * 1000)
  const onScreen = await page.evaluate(() => (document.body.innerText.match(/Too many requests[^\n]*/g) || []).slice(0, 3)).catch(() => [])
  console.log(`title: "${await page.title().catch(() => '?')}" · "Too many requests" on screen: ${onScreen.length ? JSON.stringify(onScreen) : 'no'}`)

  const c429 = reqs.filter((r) => r.s === 429).length
  const byStatus = {}
  for (const r of reqs) byStatus[r.s] = (byStatus[r.s] || 0) + 1
  console.log(`\n  ${reqs.length} API requests in ${SECONDS}s · ${c429} × 429 · by status ${JSON.stringify(byStatus)}`)
  const agg = new Map()
  for (const r of reqs) { const k = `${r.m} ${r.p}`; agg.set(k, (agg.get(k) || 0) + 1) }
  for (const [k, n] of [...agg.entries()].sort((a, b) => b[1] - a[1])) console.log(`   ${String(n).padStart(3)}×  ${k}`)
  console.log('  timeline (first 60):')
  for (const r of reqs.slice(0, 60)) console.log(`   ${String(r.at).padStart(6)}ms ${r.s} ${r.m} ${r.p}${r.rl !== '' ? `  remaining=${r.rl}` : ''}`)
  if (failed.length) { console.log(`  failed requests (${failed.length}):`); for (const f of failed.slice(0, 15)) console.log(`   ${f}`) }
  if (errors.length) { console.log(`  console/page errors (${errors.length}):`); for (const e of errors.slice(0, 15)) console.log(`   ${e}`) }
  await browser.close()
}
