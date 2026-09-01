/**
 * A2 — owned → full, proven with a real account and a real sandbox purchase.
 *
 * No forged token and no borrowed account: this signs up through the production
 * signup form, buys through the production payment sheet, and then asks the API
 * the same questions a viewer's browser would.
 */
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE)

const BASE = 'https://video-monetization-platform-chi.vercel.app'
const API = 'https://video-monetization-platform-production.up.railway.app'
const PAID = 'live-at-arusha-full-set'
const OTHER = 'behind-the-fame-a-coast-documentary'
const STOPS_AT = 217

const TS = process.env.E2E_TS || String(Date.now()).slice(-10)
const EMAIL = process.env.E2E_EMAIL || `e2e+${TS}@mtonyo.test`
const PASSWORD = process.env.E2E_PASSWORD || `E2e-Watch-${TS}!`

const log = (...a) => console.log(...a)
const ok = (cond, msg) => log(`  ${cond ? 'PASS' : 'FAIL'}  ${msg}`)

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] })
const ctx = await browser.newContext()
const page = await ctx.newPage()
page.on('pageerror', (e) => log('  PAGEERROR', String(e).slice(0, 160)))

const token = () => page.evaluate(() => localStorage.getItem('mtonyo.access'))
async function apiAs(path) {
  const t = await token()
  const res = await fetch(`${API}${path}`, { headers: t ? { Authorization: `Bearer ${t}` } : {} })
  return { status: res.status, body: await res.json().catch(() => null) }
}
const player = async () => {
  for (const f of page.frames()) {
    if (!/videodelivery|cloudflarestream/.test(f.url())) continue
    const s = await f.evaluate(() => {
      const v = document.querySelector('video')
      return v ? { t: v.currentTime, paused: v.paused, rs: v.readyState } : null
    }).catch(() => null)
    if (s) return s
  }
  return null
}
const unlockVisible = () =>
  page.locator('button', { hasText: /unlock/i }).first().isVisible().catch(() => false)

/* ------------------------------------------------------------ 1 · signup */
log(`\n### 1 · sign up through the real form   ${EMAIL}`)
await page.goto(`${BASE}/signup`, { waitUntil: 'domcontentloaded', timeout: 90000 })
await page.locator('input[name=fullName]').fill('E2E Watcher')
await page.locator('input[name=phone]').fill('0712000111')
await page.locator('input[name=email]').fill(EMAIL)
await page.locator('input[name=password]').fill(PASSWORD)
const terms = page.locator('input[type=checkbox]').first()
if (await terms.count()) await terms.check().catch(() => {})
await page.locator('button', { hasText: /create viewer account/i }).first().click()
await page.waitForTimeout(6000)
const me = await apiAs('/api/auth/me')
ok(me.status === 200, `/api/auth/me → ${me.status} ${me.body?.user?.email || me.body?.email || ''}`)

/* ------------------------------------------------- 2 · before the purchase */
log(`\n### 2 · before buying — ${PAID}`)
let pb = await apiAs(`/api/playback/${PAID}/playback`)
ok(pb.body?.playback?.kind === 'preview', `kind = ${pb.body?.playback?.kind}`)
ok(pb.body?.access?.owned === false, `owned = ${pb.body?.access?.owned}`)

/* ------------------------------------------------------------- 3 · buy it */
log(`\n### 3 · buy through the payment sheet`)
await page.goto(`${BASE}/watch/${PAID}`, { waitUntil: 'domcontentloaded', timeout: 90000 })
await page.waitForTimeout(7000)
ok(await unlockVisible(), 'Unlock CTA visible before purchase')

await page.locator('button', { hasText: /unlock/i }).first().click()
await page.waitForTimeout(3500)
const sheet = await page.evaluate(() => ({
  buttons: [...document.querySelectorAll('button')].map((b) => (b.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 42)).filter(Boolean),
}))
log('  sheet buttons:', JSON.stringify(sheet.buttons))

const payBtn = page.locator('button', { hasText: /pay|unlock|confirm|m-?pesa|airtel/i })
const n = await payBtn.count()
for (let i = 0; i < n; i++) {
  const label = ((await payBtn.nth(i).innerText().catch(() => '')) || '').trim()
  if (/pay|confirm/i.test(label) && (await payBtn.nth(i).isVisible().catch(() => false))) {
    log(`  clicking: "${label}"`)
    await payBtn.nth(i).click()
    break
  }
}
const paidAt = Date.now()
await page.waitForTimeout(20000)

/* ---------------------------------------------------- 4 · after the purchase */
log(`\n### 4 · after buying`)
pb = await apiAs(`/api/playback/${PAID}/playback`)
ok(pb.body?.playback?.kind === 'full', `kind = ${pb.body?.playback?.kind}`)
ok(pb.body?.access?.owned === true, `owned = ${pb.body?.access?.owned}`)
ok(pb.body?.access?.canWatchFull === true, `canWatchFull = ${pb.body?.access?.canWatchFull}`)
const vid = await apiAs(`/api/videos/${PAID}`)
ok(vid.body?.video?.access?.owned === true, `/api/videos access.owned = ${vid.body?.video?.access?.owned}`)

let resumed = null
for (let i = 0; i < 25; i++) {
  const s = await player()
  if (s && s.t > 0) { resumed = s; if (s.t >= STOPS_AT - 2) break }
  await page.waitForTimeout(400)
}
log(`  player after checkout: ${JSON.stringify(resumed)}  (${Date.now() - paidAt} ms since Pay)`)
ok(resumed !== null && resumed.t >= STOPS_AT - 2, `currentTime ${resumed?.t?.toFixed?.(1) ?? '—'} ≥ ${STOPS_AT - 2}`)
ok((await unlockVisible()) === false, 'no Unlock CTA after purchase')
const overlays = await page.evaluate(() =>
  [...document.querySelectorAll('button')].map((b) => (b.innerText || '').trim()).filter((t) => /^(watch now|play)$/i.test(t)).length)
ok(overlays === 0, `second Play/Watch-now overlay count = ${overlays}`)

/* ------------------------------------------- 5 · a different paid title */
log(`\n### 5 · a different paid title — ${OTHER}`)
const other = await apiAs(`/api/playback/${OTHER}/playback`)
ok(other.body?.playback?.kind === 'preview', `kind = ${other.body?.playback?.kind}`)
ok(other.body?.access?.owned === false, `owned = ${other.body?.access?.owned}`)
await page.goto(`${BASE}/watch/${OTHER}`, { waitUntil: 'domcontentloaded', timeout: 90000 })
await page.waitForTimeout(7000)
ok(await unlockVisible(), 'Unlock CTA visible on the unbought title')

/* --------------------------------------------------- 6 · logout, login once */
log(`\n### 6 · log out, log back in with ONE submit`)
await page.evaluate(() => { localStorage.removeItem('mtonyo.access'); localStorage.removeItem('mtonyo.refresh') })
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 90000 })
await page.locator('input[name=email]').fill(EMAIL)
await page.locator('input[name=password]').fill(PASSWORD)
const t0 = Date.now()
await page.locator('button', { hasText: /log in as viewer/i }).first().click()
await page.waitForTimeout(7000)
const me2 = await apiAs('/api/auth/me')
ok(me2.status === 200, `one submit → /api/auth/me ${me2.status} (${Date.now() - t0} ms)`)
const after = await apiAs(`/api/playback/${PAID}/playback`)
ok(after.body?.playback?.kind === 'full', `after re-login kind = ${after.body?.playback?.kind}`)
ok(after.body?.access?.owned === true, `after re-login owned = ${after.body?.access?.owned}`)

log(`\nACCOUNT: ${EMAIL}\nPASSWORD: ${PASSWORD}`)
await browser.close()
process.exit(0)
