/**
 * A normal person's 20 minutes on MTONYO+, against production, counting
 * every API request and watching for a single "Too many requests".
 *
 * The client's acceptance for the 2026-09-18 rate-limit outage, in their
 * words: Home → Trending → Explore → open several videos → preview →
 * navigate back → open another → login → library → creator dashboard →
 * payment test, for 15–20 minutes, without seeing the error once.
 *
 * Every `/api/*` response is tallied per leg with its status and the
 * server's own RateLimit header, and a sliding 60-second window tracks the
 * peak requests-per-minute the session ever reached against the 120 limit.
 *
 * The payment leg is a real sandbox purchase by the documented E2E viewer
 * (E2E-ACCOUNTS.md) of the one video it does not own, and it is REVERSED
 * afterwards through the admin refund path — never deleted — so the
 * creator's ledger and the client's revenue figures are left as they were.
 *
 *   E2E_EMAIL=… E2E_PASSWORD=… CREATOR_EMAIL=… CREATOR_PASSWORD=… \
 *   ADMIN_EMAIL=… ADMIN_PASSWORD=… PLAYWRIGHT_MODULE=file:///… \
 *   node scripts/e2e/normal-session.mjs
 *
 *   MINUTES=20 (target length; dwell on watch pages is stretched to reach it)
 *   BUY=rpreplay-final1589783013-2 (the fixture's unowned paid video)
 */
const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const { chromium } = pw

const BASE = process.env.BASE || 'https://video-monetization-platform-chi.vercel.app'
const API = process.env.API || 'https://video-monetization-platform-production.up.railway.app'
const MINUTES = Number(process.env.MINUTES || 20)
const BUY = process.env.BUY || 'rpreplay-final1589783013-2'
const VIEWER = { email: process.env.E2E_EMAIL, password: process.env.E2E_PASSWORD }
const CREATOR = { email: process.env.CREATOR_EMAIL, password: process.env.CREATOR_PASSWORD }
const ADMIN = { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }
for (const [name, a] of Object.entries({ VIEWER, CREATOR, ADMIN })) {
  if (!a.email || !a.password) {
    console.error(`missing credentials for ${name} — see the header of this file`)
    process.exit(2)
  }
}

const AUTOFILL = (sel, v) => `(() => {
  const el = document.querySelector(${JSON.stringify(sel)})
  if (!el) return false
  const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')
  d && d.set ? d.set.call(el, ${JSON.stringify(v)}) : (el.value = ${JSON.stringify(v)})
  el.dispatchEvent(new Event('input', { bubbles: true }))
  return true
})()`

/* ------------------------------------------------------------ tallies */
const t0 = Date.now()
const all = [] // { at, leg, method, path, status, remaining }
let leg = 'boot'
const failures = []
const check = (c, m) => {
  console.log(`      ${c ? 'ok  ' : 'FAIL'}  ${m}`)
  if (!c) failures.push(`${leg}: ${m}`)
  return c
}
const norm = (u) =>
  u.replace(/^https?:\/\/[^/]+/, '').replace(/\?.*$/, '').replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ':id')

function attach(page) {
  page.on('response', (r) => {
    const u = r.url()
    if (!/\/api\//.test(u) || /cloudflarestream|videodelivery/.test(u)) return
    all.push({
      at: Date.now(),
      leg,
      method: r.request().method(),
      path: norm(u),
      status: r.status(),
      remaining: (r.headers()['ratelimit'] || '').match(/remaining=(\d+)/)?.[1] ?? null,
    })
  })
}
const peakPerMinute = () => {
  let peak = 0
  const ts = all.map((r) => r.at).sort((a, b) => a - b)
  for (let i = 0, j = 0; i < ts.length; i++) {
    while (ts[i] - ts[j] > 60_000) j++
    peak = Math.max(peak, i - j + 1)
  }
  return peak
}
const elapsed = () => Math.round((Date.now() - t0) / 1000)

async function step(name, fn, dwell = 0) {
  leg = name
  const before = all.length
  console.log(`\n## ${name}  (t+${elapsed()}s)`)
  try {
    await fn()
  } catch (err) {
    check(false, `threw: ${String(err.message || err).split('\n')[0].slice(0, 160)}`)
  }
  if (dwell) await page.waitForTimeout(dwell)
  const mine = all.slice(before)
  const c429 = mine.filter((r) => r.status === 429).length
  const dup = new Map()
  for (const r of mine) {
    const k = `${r.method} ${r.path}`
    dup.set(k, (dup.get(k) || 0) + 1)
  }
  const last = mine.length ? mine[mine.length - 1].remaining : null
  console.log(`   ${mine.length} requests · ${c429} × 429 · bucket remaining after: ${last ?? '?'}`)
  for (const [k, n] of [...dup.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) console.log(`     ${String(n).padStart(2)}×  ${k}`)
  if (c429) check(false, `${c429} request(s) were refused with 429`)
}

/* --------------------------------------------------------------- auth */
const api = async (method, path, body, token) => {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  return { status: r.status, body: await r.json().catch(() => ({})) }
}
const tokenFor = async ({ email, password }, side) => (await api('POST', '/api/auth/login', { email, password, side })).body?.session?.accessToken

async function signOut(page, ctx) {
  await ctx.clearCookies()
  await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear() } catch {} }).catch(() => {})
}
async function signIn(page, ctx, { email, password }, side) {
  await signOut(page, ctx)
  await page.goto(`${BASE}/login?side=${side}`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForSelector('#login-id', { timeout: 40000 })
  await page.waitForTimeout(1200)
  await page.evaluate(AUTOFILL('#login-id', email))
  await page.evaluate(AUTOFILL('#login-pass', password))
  try { await page.locator('button[type=submit]').first().click({ timeout: 15000 }) }
  catch { await page.evaluate(() => document.querySelector('form')?.requestSubmit?.()) }
  for (let i = 0; i < 80; i++) {
    await page.waitForTimeout(500)
    if (!new URL(page.url()).pathname.startsWith('/login')) return true
  }
  return false
}

/* ------------------------------------------------------------- session */
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
attach(page)
console.log(`Normal session · ${BASE} · target ${MINUTES} min · ${new Date().toISOString()}`)

/* The per-leg dwell that spreads the session over the target length. */
const watchDwell = Math.max(20_000, Math.round((MINUTES * 60_000 - 6 * 60_000) / 8))

await step('Home', () => page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 90000 }), 8000)
await step('Trending — scroll down, hover four cards', async () => {
  await page.evaluate(() => document.getElementById('trending')?.scrollIntoView({ behavior: 'smooth' }))
  await page.waitForTimeout(2000)
  const cards = page.locator('.vid-card')
  const n = Math.min(4, await cards.count())
  check(n > 0, `${await cards.count()} cards on the homepage`)
  for (let i = 0; i < n; i++) { await cards.nth(i).hover().catch(() => {}); await page.waitForTimeout(900) }
}, 4000)
await step('Explore, then a category filter and back', async () => {
  await page.goto(`${BASE}/explore`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForSelector('.vid-card', { timeout: 60000 })
  const chips = page.locator('.chip[aria-pressed]')
  if ((await chips.count()) > 1) { await chips.nth(1).click(); await page.waitForTimeout(3000); await chips.nth(0).click() }
}, 5000)

const opened = []
await step('Open three videos from Explore, watching each for a while', async () => {
  for (let i = 0; i < 3; i++) {
    await page.goto(`${BASE}/explore`, { waitUntil: 'domcontentloaded', timeout: 90000 })
    await page.waitForSelector('.vid-card .vid-open', { timeout: 60000 })
    await page.waitForTimeout(1500)
    const link = page.locator('.vid-card a.vid-open').nth(i)
    const href = await link.getAttribute('href').catch(() => null)
    if (!href) { check(false, `card ${i + 1} has no link`); continue }
    await page.goto(`${BASE}${href}`, { waitUntil: 'domcontentloaded', timeout: 90000 })
    opened.push(href)
    console.log(`     · ${href} (watching ${Math.round(watchDwell / 1000)}s)`)
    await page.waitForTimeout(watchDwell)
  }
  check(opened.length === 3, `${opened.length} videos opened`)
})
await step('Paid preview (Live at Arusha) — let the preview run', async () => {
  await page.goto(`${BASE}/watch/live-at-arusha-full-set`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  const flag = await page.locator('.preview-flag').or(page.getByText(/Free preview/i)).first().waitFor({ state: 'visible', timeout: 40000 }).then(() => true).catch(() => false)
  check(flag, 'the free-preview flag is on screen')
}, watchDwell)
await step('Back (browser history) to Explore', () => page.goBack({ waitUntil: 'domcontentloaded' }), 5000)
await step('Open another (Free + Ads, Ugali) and sit through the advert', () => page.goto(`${BASE}/watch/ugali-samaki-sunday-cooking`, { waitUntil: 'domcontentloaded', timeout: 90000 }), watchDwell)

await step('Log in on the Watch side', async () => {
  check(await signIn(page, ctx, VIEWER, 'viewer'), 'signed in and left /login')
}, 3000)
await step('My Library — all four rows, then Purchases', async () => {
  await page.goto(`${BASE}/dashboard?tab=library`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForTimeout(6000)
  check((await page.locator('a[href*="/watch/"]').count()) > 0, 'the library lists videos')
  await page.goto(`${BASE}/dashboard?tab=purchases`, { waitUntil: 'domcontentloaded', timeout: 90000 })
}, 6000)
await step('Open a purchased film from the library and watch it', async () => {
  await page.goto(`${BASE}/watch/live-at-arusha-full-set`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForTimeout(8000)
  const unlock = await page.locator('button', { hasText: /unlock/i }).first().isVisible({ timeout: 2000 }).catch(() => false)
  check(!unlock, 'a film this account bought shows no Unlock button')
}, watchDwell)

await step('Log in on the Create side and walk the creator dashboard', async () => {
  check(await signIn(page, ctx, CREATOR, 'creator'), 'creator signed in')
  for (const tab of ['overview', 'videos', 'earnings', 'analytics', 'capital', 'profile']) {
    await page.goto(`${BASE}/dashboard?tab=${tab}`, { waitUntil: 'domcontentloaded', timeout: 90000 })
    await page.waitForTimeout(5000)
  }
}, 3000)

let paymentId = null
let buyVideoId = null
await step('Payment test — Watch side buys the one video it does not own (sandbox)', async () => {
  check(await signIn(page, ctx, VIEWER, 'viewer'), 'viewer signed in again')
  await page.goto(`${BASE}/watch/${BUY}`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  const unlock = page.locator('button', { hasText: /unlock/i }).first()
  const seen = await unlock.waitFor({ state: 'visible', timeout: 40000 }).then(() => true).catch(() => false)
  if (!check(seen, 'the paywall offers Unlock')) return
  await unlock.click()
  await page.waitForSelector('.pay-modal', { timeout: 20000 })
  await page.locator('#pay-phone').fill('0712345678')
  await page.locator('.pay-modal button[type=submit]').first().click()
  let closed = false
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(1000)
    if (!(await page.locator('.pay-modal').count())) { closed = true; break }
    const failed = await page.locator('.pay-failed').first().textContent({ timeout: 300 }).catch(() => null)
    if (failed) { check(false, `payment sheet failed: ${failed.trim().slice(0, 120)}`); return }
  }
  check(closed, 'the payment sheet closed itself (sandbox settled)')
  await page.waitForTimeout(6000)
  const unlockAfter = await page.locator('button', { hasText: /unlock/i }).first().isVisible({ timeout: 2000 }).catch(() => false)
  check(!unlockAfter, 'the film is unlocked after paying')
  const vt = await tokenFor(VIEWER, 'viewer')
  const purchases = await api('GET', '/api/library/purchases', null, vt)
  const row = (purchases.body?.purchases || purchases.body?.items || []).find((p) => (p.video?.slug || p.slug) === BUY)
  buyVideoId = row?.video?.id || row?.videoId || null
  paymentId = row?.paymentId || row?.payment?.id || null
  console.log(`     · purchase row: ${JSON.stringify(row || purchases.body).slice(0, 200)}`)
}, 4000)

/* ---------------------------------------------------------- reversal */
await step('Reverse the test purchase through the admin refund path', async () => {
  const at = await tokenFor(ADMIN, 'viewer')
  if (!at) { check(false, 'admin sign-in failed — refund the purchase by hand in Admin → Payments'); return }
  if (!paymentId) {
    const list = await api('GET', '/api/admin/payments?limit=50', null, at)
    const rows = list.body?.payments || list.body?.items || []
    const mine = rows.filter((p) => (p.user?.email || p.userEmail || p.email) === VIEWER.email && (p.video?.slug || p.videoSlug || p.slug) === BUY && (p.status === 'success'))
    mine.sort((a, b) => new Date(b.createdAt || b.created_at) - new Date(a.createdAt || a.created_at))
    paymentId = mine[0]?.id || null
    if (!paymentId) console.log(`     · could not find the payment in the admin list (${rows.length} rows); first row: ${JSON.stringify(rows[0] || {}).slice(0, 200)}`)
  }
  if (!paymentId) { check(false, 'no payment id — refund by hand in Admin → Payments (viewer ' + VIEWER.email + ', video ' + BUY + ')'); return }
  const r = await api('POST', `/api/admin/payments/${paymentId}/refund`, { reason: 'E2E normal-session payment test, reversed (2026-09-18)' }, at)
  check(r.status === 200, `refund ${paymentId} → ${r.status} ${JSON.stringify(r.body).slice(0, 120)}`)
  const vt = await tokenFor(VIEWER, 'viewer')
  if (buyVideoId) {
    const ent = await api('GET', `/api/library/entitlement/${buyVideoId}`, null, vt)
    check(ent.body?.owned === false || ent.body?.entitled === false || ent.body?.access?.owned === false, `entitlement withdrawn after refund (${JSON.stringify(ent.body).slice(0, 100)})`)
  }
})

/* ------------------------------------------------------------ summary */
await browser.close()
const total = all.length
const mins = (Date.now() - t0) / 60000
const c429 = all.filter((r) => r.status === 429).length
console.log(`\n=== SESSION: ${mins.toFixed(1)} min · ${total} API requests · average ${(total / mins).toFixed(1)} req/min · peak ${peakPerMinute()} in any 60s (limit 120) · 429s: ${c429}`)
const agg = new Map()
for (const r of all) { const k = `${r.method} ${r.path}`; agg.set(k, (agg.get(k) || 0) + 1) }
console.log('=== by endpoint ===')
for (const [k, n] of [...agg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`   ${String(n).padStart(3)}×  ${k}`)
console.log(`\n${failures.length ? `${failures.length} FAILED CHECK(S):\n  ${failures.join('\n  ')}` : 'ALL CHECKS PASSED — not one "Too many requests"'}`)
process.exit(failures.length ? 1 : 0)
