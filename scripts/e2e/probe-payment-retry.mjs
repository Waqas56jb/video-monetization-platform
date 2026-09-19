/**
 * The client's "retry payment" sequence, on production, counting every API
 * request: signed in, open a paid video this account does not own, Unlock,
 * Test declined → Try again → Test cancelled → Try again → close, then open
 * another video. Nothing is bought: the sandbox outcomes used here never
 * create an entitlement.
 *
 * Written 2026-09-19 because the long session's retry leg looked for the
 * sandbox links with `isVisible()`, which does not wait, and missed them.
 *
 *   PLAYWRIGHT_MODULE=file:///… E2E_EMAIL=… E2E_PASSWORD=… node scripts/e2e/probe-payment-retry.mjs
 */
const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const { chromium } = pw
const BASE = process.env.BASE || 'https://video-monetization-platform-chi.vercel.app'
const SLUG = process.env.SLUG || 'nyerere-day-rehearsals-awaiting-review'
const NEXT = process.env.NEXT || 'the-fishermen-of-kilwa'
const VIEWER = { email: process.env.E2E_EMAIL, password: process.env.E2E_PASSWORD }
if (!VIEWER.email) { console.error('E2E_EMAIL / E2E_PASSWORD required'); process.exit(2) }

const norm = (u) => u.replace(/^https?:\/\/[^/]+/, '').replace(/\?.*$/, '').replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ':id')
const AUTOFILL = (sel, v) => `(() => {
  const el = document.querySelector(${JSON.stringify(sel)})
  if (!el) return false
  const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')
  d && d.set ? d.set.call(el, ${JSON.stringify(v)}) : (el.value = ${JSON.stringify(v)})
  el.dispatchEvent(new Event('input', { bubbles: true }))
  return true
})()`

const failures = []
const check = (c, m) => { console.log(`  ${c ? 'ok  ' : 'FAIL'}  ${m}`); if (!c) failures.push(m); return c }

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
const reqs = []
let t0 = Date.now()
page.on('response', (r) => {
  const u = r.url()
  if (!/\/api\//.test(u) || /cloudflarestream|videodelivery/.test(u)) return
  reqs.push({ at: Date.now() - t0, m: r.request().method(), p: norm(u), s: r.status(), rl: (r.headers()['ratelimit'] || '').match(/remaining=(\d+)/)?.[1] ?? '' })
})

/* sign in */
await page.goto(`${BASE}/login?side=viewer`, { waitUntil: 'domcontentloaded', timeout: 90000 })
await page.waitForSelector('#login-id', { timeout: 40000 })
await page.waitForTimeout(1000)
await page.evaluate(AUTOFILL('#login-id', VIEWER.email))
await page.evaluate(AUTOFILL('#login-pass', VIEWER.password))
await page.locator('button[type=submit]').first().click({ timeout: 15000 }).catch(() => {})
for (let i = 0; i < 60; i++) { await page.waitForTimeout(500); if (!new URL(page.url()).pathname.startsWith('/login')) break }
check(!new URL(page.url()).pathname.startsWith('/login'), 'signed in')
reqs.length = 0
t0 = Date.now()

console.log(`\n### retry-payment sequence on /watch/${SLUG}`)
await page.goto(`${BASE}/watch/${SLUG}`, { waitUntil: 'domcontentloaded', timeout: 90000 })
const unlock = page.locator('button', { hasText: /unlock/i }).first()
check(await unlock.waitFor({ state: 'visible', timeout: 40000 }).then(() => true).catch(() => false), 'the paywall offers Unlock')
await unlock.click()
await page.waitForSelector('.pay-modal', { timeout: 20000 })
const outcomes = page.locator('.pay-modal .sandbox-outcomes button')
check(await outcomes.first().waitFor({ state: 'visible', timeout: 20000 }).then(() => true).catch(() => false), 'the sandbox test outcomes are shown (Test declined / Test cancelled)')

for (const label of [/test declined/i, /test cancelled/i]) {
  await page.locator('#pay-phone').fill('0712345678').catch(() => {})
  const link = page.locator('.pay-modal .sandbox-outcomes button', { hasText: label }).first()
  if (!check(await link.isVisible().catch(() => false), `"${label.source}" is available`)) break
  const before = reqs.length
  await link.click()
  const failed = await page.locator('.pay-failed').first().waitFor({ state: 'visible', timeout: 30000 }).then(() => true).catch(() => false)
  check(failed, `the failure screen appears after ${label.source}`)
  const text = (await page.locator('.pay-failed').first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim()
  check(!/Too many requests/i.test(text), `it is the payment's own message, not a rate limit ("${text.slice(0, 80)}")`)
  const polls = reqs.slice(before).filter((r) => /^GET \/api\/payments\/:id$/.test(`${r.m} ${r.p}`)).length
  console.log(`     · requests for this attempt: ${reqs.length - before} (payment status polls: ${polls})`)
  const again = page.locator('.pay-failed button', { hasText: /try again/i }).first()
  if (check(await again.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false), 'Try again is offered')) {
    await again.click()
    await page.waitForSelector('#pay-phone', { timeout: 15000 }).catch(() => {})
  }
}
await page.keyboard.press('Escape').catch(() => {})
await page.waitForTimeout(1500)
check((await page.locator('.pay-modal').count()) === 0, 'the sheet closes')

console.log(`\n### then another video: /watch/${NEXT} for 30s`)
await page.goto(`${BASE}/watch/${NEXT}`, { waitUntil: 'domcontentloaded', timeout: 90000 })
await page.waitForTimeout(30000)
const onScreen = await page.evaluate(() => (document.body.innerText.match(/Too many requests[^\n]*/g) || []).length).catch(() => 0)
check(onScreen === 0, '"Too many requests" is not on screen')

const c429 = reqs.filter((r) => r.s === 429).length
const agg = new Map()
for (const r of reqs) { const k = `${r.m} ${r.p}`; agg.set(k, (agg.get(k) || 0) + 1) }
console.log(`\n=== ${reqs.length} API requests · ${c429} × 429 · last bucket remaining: ${[...reqs].reverse().find((r) => r.rl !== '')?.rl ?? '?'}`)
for (const [k, n] of [...agg.entries()].sort((a, b) => b[1] - a[1])) console.log(`   ${String(n).padStart(3)}×  ${k}`)
console.log(`\n${failures.length ? `${failures.length} FAILED CHECK(S):\n  ${failures.join('\n  ')}` : 'ALL CHECKS PASSED'}`)
await browser.close()
process.exit(failures.length ? 1 : 0)
