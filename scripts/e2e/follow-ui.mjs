/**
 * C1, browser half — Follow where a viewer can actually reach it.
 *
 * The CLI block (server/scripts/follow-cli.mjs) proves the graph, the count and
 * the blocked-creator case. This proves the three things only a browser can:
 *
 *   · the control exists on the watch page and on cards, which is the whole
 *     point — it was reachable only from a creator page nothing links to
 *   · it flips OPTIMISTICALLY: the label changes before the round trip is done,
 *     which is the difference between "instant" and the sluggishness reported
 *   · it survives logout → login, which is the client's actual complaint
 *
 * The optimistic assertion is measured against the network, not against a
 * stopwatch: the request is held open, and the label has to have changed while
 * it is still in flight. A timing threshold would pass on a fast connection for
 * the wrong reason.
 */
const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const { devices } = pw

const BASE = process.env.BASE || 'https://video-monetization-platform-chi.vercel.app'
const SLUG = process.env.SLUG || 'how-to-cook-pilau-properly'
const EMAIL = process.env.E2E_EMAIL
const PASSWORD = process.env.E2E_PASSWORD

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

async function signIn(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 90000 })
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
  { name: 'chromium desktop', engine: 'chromium', opts: { viewport: { width: 1440, height: 900 } } },
  { name: 'iPhone 14 · webkit', engine: 'webkit', opts: { ...devices['iPhone 14'] } },
]
const only = process.env.PROFILES ? process.env.PROFILES.split(',').map((s) => s.trim()) : null

for (const profile of PROFILES) {
  if (only && !only.includes(profile.name)) continue
  console.log(`\n### ${profile.name}`)
  const browser = await pw[profile.engine].launch()
  const ctx = await browser.newContext({ ...profile.opts })
  const page = await ctx.newPage()

  await signIn(page)

  /* ---------------------------------------------------- the watch page ---- */
  await page.goto(`${BASE}/watch/${SLUG}`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForTimeout(5000)
  const rowFollow = page.locator('.creator-row .follow-btn').first()
  const onWatch = await rowFollow.isVisible({ timeout: 20000 }).catch(() => false)
  check(onWatch, 'the watch page offers Follow on the creator row')
  if (!onWatch) { await browser.close(); continue }

  // Start from "not following" whatever the account's history is.
  if ((await rowFollow.getAttribute('aria-pressed')) === 'true') {
    await rowFollow.click()
    await page.waitForTimeout(2500)
  }
  const startLabel = (await rowFollow.textContent()).trim()

  /* ---- optimistic: the label changes while the request is still open ---- */
  let releaseRequest
  const held = new Promise((r) => { releaseRequest = r })
  await page.route('**/api/creators/*/follow', async (route) => {
    await held
    /* The route can already be resolved by the time this wakes — unrouting
       while a held request is pending resolves it — and continuing it twice
       throws "Route is already handled" and kills the run. The interception is
       a measuring device; it must not be able to fail the thing it measures. */
    await route.continue().catch(() => {})
  })
  await rowFollow.click()
  await page.waitForTimeout(350)
  const labelWhileInFlight = (await rowFollow.textContent()).trim()
  check(
    labelWhileInFlight !== startLabel && /following/i.test(labelWhileInFlight),
    `the label flips while the request is still in flight ("${startLabel}" → "${labelWhileInFlight}")`
  )
  releaseRequest()
  await page.unroute('**/api/creators/*/follow')
  await page.waitForTimeout(3000)
  const settled = (await rowFollow.textContent()).trim()
  check(/following/i.test(settled), `and it stays followed once the server answers ("${settled}")`)

  /* ---- and it survives a reload, which is where state usually dies ------ */
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForTimeout(6000)
  const afterReload = (await page.locator('.creator-row .follow-btn').first().textContent().catch(() => '')).trim()
  check(/following/i.test(afterReload), `still Following after a reload ("${afterReload}")`)

  /* ---------------------------------------------------------- the cards -- */
  await page.goto(`${BASE}/explore`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForTimeout(7000)
  const cardFollows = await page.locator('.vid-card .follow-btn').count()
  const cardCreatorLinks = await page.locator('.vid-card a.vid-by-link').count()
  const cards = await page.locator('.vid-card').count()
  check(cardFollows > 0, `cards carry Follow (${cardFollows} of ${cards} cards)`)
  check(cardCreatorLinks > 0, `and the creator's name is a link (${cardCreatorLinks} of ${cards} cards)`)

  /* A card is still one tap to the video, which is what the restructure risked. */
  /* The POSTER, not the title. Clicking the title proved nothing about the part
     of the card people actually press — see matrix.mjs journey 3. */
  const before = page.url()
  /* By coordinate: `click()` refuses when the card's overlay link intercepts,
     which is the overlay doing its job. See scripts/e2e/card-press.mjs. */
  const thumb = page.locator('.vid-card .vid-thumb').first()
  await thumb.scrollIntoViewIfNeeded().catch(() => {})
  await page.waitForTimeout(400)
  const tb = await thumb.boundingBox()
  if (profile.opts.hasTouch) await page.touchscreen.tap(tb.x + tb.width / 2, tb.y + tb.height / 2)
  else await page.mouse.click(tb.x + tb.width / 2, tb.y + tb.height / 2)
  await page.waitForTimeout(2500)
  check(
    page.url() !== before && /\/watch\//.test(page.url()),
    `tapping a card's picture still opens the video on tap #1 (${page.url() === before ? 'DID NOT NAVIGATE' : new URL(page.url()).pathname})`
  )

  /* ...and the creator link goes to the creator, not to the video. */
  await page.goto(`${BASE}/explore`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForTimeout(7000)
  await page.locator('.vid-card a.vid-by-link').first().click()
  await page.waitForTimeout(2500)
  check(/\/creator\//.test(page.url()), `the creator's name goes to their page, not the video (${new URL(page.url()).pathname})`)

  /* ---------------------------------------------- logout → login -------- */
  await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear() } catch {} })
  await ctx.clearCookies()
  await signIn(page)
  await page.goto(`${BASE}/watch/${SLUG}`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForTimeout(6000)
  const afterRelogin = (await page.locator('.creator-row .follow-btn').first().textContent().catch(() => '')).trim()
  check(/following/i.test(afterRelogin), `the follow survives logout → login ("${afterRelogin}")`)

  // Leave the account as it was found.
  const cleanup = page.locator('.creator-row .follow-btn').first()
  if ((await cleanup.getAttribute('aria-pressed').catch(() => null)) === 'true') {
    await cleanup.click()
    await page.waitForTimeout(2500)
  }

  await browser.close()
}

console.log(fails.length ? `\n${fails.length} FAILURE(S):\n  - ${fails.join('\n  - ')}` : '\nALL PASS')
process.exit(fails.length ? 1 : 0)
