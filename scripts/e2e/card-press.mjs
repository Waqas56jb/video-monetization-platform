/**
 * Every part of a video card, on every profile: what does ONE press do?
 *
 * This exists because the suite missed a bug the client found in a minute.
 * Journey 3 and the follow suite both clicked `.vid-open` — the title — so they
 * passed on seven profiles while pressing the POSTER did nothing at all except
 * leave the top progress bar running. The picture is what people press. The
 * title is a strip of text nobody aims at.
 *
 * So this presses each part in turn, by COORDINATE rather than by element.
 * `locator.click()` refuses when a different element would receive the event,
 * which is exactly what happens when a stretched link correctly covers the
 * poster — Playwright reports "intercepts pointer events" and gives up. That
 * refusal is the fix working. A finger has no such scruples: it lands at a point
 * and whatever is on top gets it.
 *
 * Two probe faults are worth remembering, because both reported the site as
 * broken when it was not:
 *   · the price row sat at y 888-931 in a 900 px window, so "press its centre"
 *     pressed a point below the window. Everything is scrolled in and clamped now.
 *   · signed out, pressing Save is not a no-op — it goes to sign in carrying the
 *     page you were on. The pin disappearing is correct, and is asserted.
 *
 *   PLAYWRIGHT_MODULE=file:///… E2E_EMAIL=… E2E_PASSWORD=… node scripts/e2e/card-press.mjs
 */
const pw = await import(process.env.PLAYWRIGHT_MODULE)
const { devices } = pw
const BASE = 'https://video-monetization-platform-chi.vercel.app'
const ok = (c, m) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${m}`); return Boolean(c) }
const fails = []
const check = (c, m) => { if (!ok(c, m)) fails.push(m); return Boolean(c) }

const EMAIL = process.env.E2E_EMAIL
const PASSWORD = process.env.E2E_PASSWORD
const AUTOFILL = (sel, v) => `(() => {
  const el = document.querySelector(${JSON.stringify(sel)})
  if (!el) return false
  const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')
  d.set.call(el, ${JSON.stringify(v)})
  el.dispatchEvent(new Event('input', { bubbles: true }))
  return true
})()`

const PROFILES = [
  ['chromium desktop', 'chromium', { viewport: { width: 1440, height: 900 } }],
  ['webkit desktop', 'webkit', { viewport: { width: 1440, height: 900 } }],
  ['iPhone 14 · webkit', 'webkit', { ...devices['iPhone 14'] }],
  ['iPad Pro 11 + mouse', 'webkit', { ...devices['iPad Pro 11'], hasTouch: true, isMobile: false }],
  ['Pixel 7', 'chromium', { ...devices['Pixel 7'] }],
]

for (const [name, engine, opts] of PROFILES) {
  console.log(`\n### ${name}`)
  const b = await pw[engine].launch()
  const ctx = await b.newContext(opts)
  const page = await ctx.newPage()

  const fresh = async () => {
    await page.goto(`${BASE}/explore`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    /* One reload before giving up. Explore occasionally takes longer than a
       minute to paint from here on a cold edge, and a harness that throws there
       reports the page as broken for what is a slow load. */
    try {
      await page.waitForSelector('.vid-card', { state: 'attached', timeout: 45000 })
    } catch {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 })
      await page.waitForSelector('.vid-card', { state: 'attached', timeout: 60000 })
    }
    await page.waitForTimeout(4500)
    /* Put the first card fully in view before anything is measured. The price
       row sat at y 888-931 in a 900 px window, so pressing "its centre" pressed
       a point below the window and reported the site as broken. */
    await page.locator('.vid-card').first().scrollIntoViewIfNeeded().catch(() => {})
    await page.waitForTimeout(800)
  }

  // what is under the finger at the poster's centre
  await fresh()
  const hit = await page.evaluate(() => {
    const t = document.querySelector('.vid-card .vid-thumb')
    const r = t.getBoundingClientRect()
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return { tag: el?.tagName?.toLowerCase(), link: el?.closest('a')?.className || null }
  })
  check(Boolean(hit.link) && hit.link.includes('vid-open'), `the poster's centre resolves to the card link (hit <${hit.tag}>, link "${hit.link}")`)

  // one press on each part
  for (const [what, sel, expect] of [
    ['the poster', '.vid-thumb', /\/watch\//],
    ['the title', '.vid-open', /\/watch\//],
    ['the price row', '.vid-meta', /\/watch\//],
    ["the creator's name", 'a.vid-by-link', /\/creator\//],
  ]) {
    await fresh()
    const before = page.url()
    /**
     * Tap the COORDINATES, not the element.
     *
     * `locator.click()` refuses when a different element would receive the
     * event — and now that the stretched link correctly covers the poster,
     * that is exactly what happens: Playwright reports "<a class=vid-open>
     * intercepts pointer events" and gives up. That refusal is the fix working.
     * A finger has no such scruples; it lands at a point and whatever is on top
     * gets it. So: press the point.
     */
    const el = page.locator(`.vid-card ${sel}`).first()
    await el.scrollIntoViewIfNeeded().catch(() => {})
    await page.waitForTimeout(500)
    const box = await el.boundingBox()
    const vp = page.viewportSize()
    const x = box.x + box.width / 2
    // Clamp into the window: a point outside it presses nothing and proves nothing.
    const y = Math.min(box.y + box.height / 2, vp.height - 6)
    if (page.context()._options?.hasTouch ?? opts.hasTouch) await page.touchscreen.tap(x, y)
    else await page.mouse.click(x, y)
    await page.waitForTimeout(3500)
    const moved = page.url() !== before
    check(moved && expect.test(page.url()), `one press on ${what} → ${moved ? new URL(page.url()).pathname : 'DID NOT NAVIGATE'}`)
  }

  /* Signed OUT, pressing Save is not a no-op: it goes to sign in, carrying the
     page you were on. The first version of this probe did not know that and read
     the pin disappearing as the pin being broken. */
  await fresh()
  const outBefore = page.url()
  const outPin = page.locator('.vid-card .save-pin').first()
  await outPin.scrollIntoViewIfNeeded().catch(() => {})
  const ob = await outPin.boundingBox()
  if (opts.hasTouch) await page.touchscreen.tap(ob.x + ob.width / 2, ob.y + ob.height / 2)
  else await page.mouse.click(ob.x + ob.width / 2, ob.y + ob.height / 2)
  await page.waitForTimeout(2500)
  check(
    /\/login/.test(page.url()) && decodeURIComponent(page.url()).includes('/explore'),
    `signed out, Save goes to sign in carrying the page (${new URL(page.url()).pathname + new URL(page.url()).search})`
  )

  /* ---- and signed in, it toggles in place ---- */
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForSelector('#login-id', { timeout: 40000 })
  await page.waitForTimeout(1500)
  await page.evaluate(AUTOFILL('#login-id', EMAIL))
  await page.evaluate(AUTOFILL('#login-pass', PASSWORD))
  try { await page.locator('button[type=submit]').first().click({ timeout: 15000 }) }
  catch { await page.evaluate(() => document.querySelector('form')?.requestSubmit?.()) }
  for (let i = 0; i < 60; i++) { await page.waitForTimeout(500); if (!new URL(page.url()).pathname.startsWith('/login')) break }

  await fresh()
  const before = page.url()
  const pin = page.locator('.vid-card .save-pin').first()
  await pin.waitFor({ state: 'attached', timeout: 30000 })
  await pin.scrollIntoViewIfNeeded().catch(() => {})
  await page.waitForTimeout(500)
  const wasPressed = (await pin.getAttribute('aria-pressed')) === 'true'
  const pinBox = await pin.boundingBox()
  const tapPin = async () => {
    const b2 = await pin.boundingBox()
    if (opts.hasTouch) await page.touchscreen.tap(b2.x + b2.width / 2, b2.y + b2.height / 2)
    else await page.mouse.click(b2.x + b2.width / 2, b2.y + b2.height / 2)
  }
  await tapPin()
  await page.waitForTimeout(600)
  const nowPressed = (await pin.getAttribute('aria-pressed')) === 'true'
  check(nowPressed !== wasPressed, `the Save pin toggles on one press at ${Math.round(pinBox.width)}x${Math.round(pinBox.height)} px (${wasPressed} → ${nowPressed})`)
  check(page.url() === before, 'and does not open the video')
  const barAfterSave = await page.locator('.top-progress, [class*="topbar"], [class*="top-progress"]').count()
  await page.waitForTimeout(2500)
  const barStillUp = await page.evaluate(() => {
    const el = document.querySelector('.top-progress, [class*="top-progress"]')
    return el ? getComputedStyle(el).opacity !== '0' && el.offsetParent !== null : false
  })
  check(!barStillUp, `the top progress bar is not left running after a Save press (elements found: ${barAfterSave})`)
  // put it back
  await tapPin()
  await page.waitForTimeout(1500)

  await b.close()
}
console.log(fails.length ? `\n${fails.length} FAILURE(S):\n  - ${fails.join('\n  - ')}` : '\nALL PASS')
process.exit(fails.length ? 1 : 0)
