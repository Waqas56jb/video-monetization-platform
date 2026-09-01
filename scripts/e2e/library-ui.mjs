/**
 * C4 / C5 / C6, browser half — the four rows, the Save toggle, Remove from
 * history, and the request count when the tab is opened.
 *
 * C6's bar is **eight requests or fewer** to open My Library. That is the whole
 * reason `GET /api/library` answers all four rows together: four separate calls
 * would be four requests on top of everything the dashboard already asks for,
 * against a limiter of 120 a minute that a checkout also has to fit inside.
 *
 * The count is taken from the moment the Library tab is opened, not from the
 * page load, because the bar is about opening the tab.
 */
const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const { devices } = pw

const BASE = process.env.BASE || 'https://video-monetization-platform-chi.vercel.app'
const EMAIL = process.env.E2E_EMAIL
const PASSWORD = process.env.E2E_PASSWORD
const BUDGET = Number(process.env.BUDGET || 8)

const ok = (c, m) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${m}`); return Boolean(c) }
const fails = []
const check = (c, m) => { if (!ok(c, m)) fails.push(m); return Boolean(c) }

const AUTOFILL = (sel, v) => `(() => {
  const el = document.querySelector(${JSON.stringify(sel)})
  if (!el) return false
  const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')
  d && d.set ? d.set.call(el, ${JSON.stringify(v)}) : (el.value = ${JSON.stringify(v)})
  el.dispatchEvent(new Event('input', { bubbles: true }))
  return true
})()`

async function signIn(page, ctx) {
  await ctx.clearCookies()
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear() } catch {} }).catch(() => {})
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForSelector('#login-id', { timeout: 30000 })
  await page.waitForTimeout(1500)
  await page.evaluate(AUTOFILL('#login-id', EMAIL))
  await page.evaluate(AUTOFILL('#login-pass', PASSWORD))
  try { await page.locator('button[type=submit]').first().click({ timeout: 15000 }) }
  catch { await page.evaluate(() => document.querySelector('form')?.requestSubmit?.()) }
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(500)
    if (!new URL(page.url()).pathname.startsWith('/login')) return true
  }
  return false
}

const PROFILES = [
  { name: 'webkit desktop', engine: 'webkit', opts: { viewport: { width: 1440, height: 900 } } },
  { name: 'iPhone 14 · webkit', engine: 'webkit', opts: { ...devices['iPhone 14'] } },
  { name: 'chromium desktop', engine: 'chromium', opts: { viewport: { width: 1440, height: 900 } } },
]
const only = process.env.PROFILES ? process.env.PROFILES.split(',').map((s) => s.trim()) : null

for (const profile of PROFILES) {
  if (only && !only.includes(profile.name)) continue
  console.log(`\n### ${profile.name}`)
  const browser = await pw[profile.engine].launch()
  const ctx = await browser.newContext({ ...profile.opts })
  const page = await ctx.newPage()

  await signIn(page, ctx)

  /* ---- save something first, from a card, so My List has a row --------- */
  await page.goto(`${BASE}/explore`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForTimeout(7000)
  const pins = await page.locator('.vid-card .save-pin').count()
  check(pins > 0, `cards carry a Save control (${pins})`)
  const pin = page.locator('.vid-card .save-pin').first()
  const wasSaved = (await pin.getAttribute('aria-pressed')) === 'true'
  if (wasSaved) { await pin.click(); await page.waitForTimeout(2000) }
  await pin.click()
  await page.waitForTimeout(400)
  check(
    (await pin.getAttribute('aria-pressed')) === 'true',
    'Save flips immediately when pressed, without waiting for the round trip'
  )
  await page.waitForTimeout(2500)

  /* ---- open the library, counting requests ---------------------------- */
  const reqs = []
  const record = (r) => { if (r.url().includes('/api/')) reqs.push(r.url().split('?')[0].split('/api')[1]) }
  page.on('request', record)
  await page.goto(`${BASE}/dashboard?tab=library`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForSelector('.lib-row', { timeout: 40000 }).catch(() => {})
  await page.waitForTimeout(8000)
  page.off('request', record)

  const rows = await page.locator('.lib-row-head h3').allTextContents()
  console.log(`  rows, in order: ${rows.join(' · ')}`)
  const expected = ['Continue Watching', 'Purchased', 'My List', 'Recently Watched']
  const present = expected.filter((t) => rows.includes(t))
  check(rows.includes('My List'), 'My List is drawn, holding the video just saved')
  check(
    JSON.stringify(present) === JSON.stringify(rows.filter((r) => expected.includes(r))),
    `the rows are in the order the client asked for (${rows.join(' · ')})`
  )

  const counts = {}
  for (const u of reqs) counts[u] = (counts[u] || 0) + 1
  console.log(`  C6 — ${reqs.length} API requests to open My Library (bar: ${BUDGET})`)
  console.log(`     ${Object.entries(counts).map(([k, v]) => `${k}×${v}`).join('  ')}`)
  check(reqs.length <= BUDGET, `${reqs.length} of ${BUDGET} allowed`)
  check((counts['/library'] || 0) === 1, 'the four rows cost one batched /api/library, not four calls')

  /* ---- Remove from history -------------------------------------------- */
  const forgets = await page.locator('.lib-forget').count()
  check(forgets > 0, `Remove from history is offered (${forgets} controls)`)
  if (forgets > 0) {
    const beforeRecent = await page.locator('.lib-row').filter({ hasText: 'Recently Watched' }).locator('.lib-item').count()
    await page.locator('.lib-forget').first().click()
    await page.waitForTimeout(400)
    const afterRecent = await page.locator('.lib-row').filter({ hasText: 'Recently Watched' }).locator('.lib-item').count()
    check(afterRecent < beforeRecent, `the tile goes at once, without a refetch (${beforeRecent} → ${afterRecent})`)
    await page.waitForTimeout(2500)
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 })
    await page.waitForTimeout(8000)
    const stillGone = await page.locator('.lib-row').filter({ hasText: 'Recently Watched' }).locator('.lib-item').count()
    check(stillGone <= afterRecent, `and it is still gone after a reload (${stillGone})`)
  }

  /* ---- leave the account as we found it ------------------------------- */
  await page.goto(`${BASE}/explore`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForTimeout(6000)
  const cleanup = page.locator('.vid-card .save-pin[aria-pressed="true"]').first()
  if (await cleanup.count()) { await cleanup.click(); await page.waitForTimeout(2500) }

  await browser.close()
}

console.log(fails.length ? `\n${fails.length} FAILURE(S):\n  - ${fails.join('\n  - ')}` : '\nALL PASS')
process.exit(fails.length ? 1 : 0)
