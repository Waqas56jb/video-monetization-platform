/**
 * B1–B3 — the payment journey, end to end, on a viewer who has never paid.
 *
 * preview → paywall → Unlock → sandbox Pay → the sheet closes itself → the same
 * film continues from the stop point → My Library shows it → log out → log in
 * (one submit) → still full → a second paid title is still locked.
 * Then the two failure paths: declined and cancelled.
 *
 * WHAT THIS CAN AND CANNOT RUN WHERE. Playwright's WebKit has no Media Source
 * Extensions, so Cloudflare's player never decodes a frame there and no
 * `currentTime` assertion means anything on it (DECISIONS.md, 2026-09-01). So:
 *
 *   chromium desktop, Pixel 7   the whole journey, including resume
 *   webkit desktop, iPhone 14   the modal's layout and that the sheet closes
 *
 * ENTITLEMENT IS CONFIRMED FROM THE API FIRST, not from the picture. The film
 * appearing to play proves nothing about what the server granted; `kind: full`
 * on `/api/playback/:id` does. The player assertion runs after that, and only
 * where a player can run.
 *
 * REQUESTS ARE COUNTED THROUGHOUT (B3). The limiter is 120/min per IP in
 * production; a checkout plus browsing has to fit inside it with room to spare.
 */
const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const { devices } = pw

const BASE = process.env.BASE || 'https://video-monetization-platform-chi.vercel.app'
const API = process.env.API || 'https://video-monetization-platform-production.up.railway.app'
const BUY = process.env.BUY || 'rpreplay-final1589783013-2'
const SECOND = process.env.SECOND || 'live-at-arusha-full-set'
/**
 * RUNS repeats only the leg the brief asks for five of: preview stop -> Unlock ->
 * Pay -> sheet closes -> kind:full from the API -> the film continues from the
 * stop point. Everything else in the journey (library, logout, the second title,
 * declined and cancelled) is proved once, on run 1, because repeating it would
 * cost four more production accounts a run to re-prove something that does not
 * vary. Each run still uses its own never-paid viewer, because a repeat on an
 * account that already owns the film would assert nothing.
 */
const RUNS = Number(process.env.RUNS || 1)

const ok = (c, m) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${m}`); return Boolean(c) }
const fails = []
const check = (c, m) => { if (!ok(c, m)) fails.push(m); return Boolean(c) }

const PROFILES = {
  'chromium desktop': { engine: 'chromium', full: true, opts: { viewport: { width: 1440, height: 900 } } },
  'Pixel 7': { engine: 'chromium', full: true, opts: { ...devices['Pixel 7'] } },
  'webkit desktop': { engine: 'webkit', full: false, opts: { viewport: { width: 1440, height: 900 } } },
  'iPhone 14': { engine: 'webkit', full: false, opts: { ...devices['iPhone 14'] } },
  /* The size B2 names. iPhone 14 is 390x664, so it does not actually exercise
     the smallest screen the sheet has to fit — an iPhone SE / 8 does. */
  '375x667 webkit': { engine: 'webkit', full: false, opts: { ...devices['iPhone SE'], viewport: { width: 375, height: 667 } } },
}
const only = process.env.PROFILES ? process.env.PROFILES.split(',').map((s) => s.trim()) : Object.keys(PROFILES)

/* ------------------------------------------------------------ helpers */

const AUTOFILL = (sel, v) => `(() => {
  const el = document.querySelector(${JSON.stringify(sel)})
  if (!el) return false
  const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')
  d && d.set ? d.set.call(el, ${JSON.stringify(v)}) : (el.value = ${JSON.stringify(v)})
  el.dispatchEvent(new Event('input', { bubbles: true }))
  return true
})()`

async function apiToken(email, password) {
  const r = await fetch(`${API}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, side: 'viewer' }),
  })
  const j = await r.json().catch(() => ({}))
  return j?.session?.accessToken || j?.accessToken || j?.session?.access_token || j?.token || null
}

/**
 * What the SERVER says this viewer may watch — the only entitlement evidence
 * that counts. `playback.kind` is `preview` or `full`; `stopsAtSeconds` is where
 * a preview is cut and is also the number the resume assertion is measured
 * against, because it is the site's own figure rather than the harness's guess.
 */
async function entitlement(token, videoId) {
  const r = await fetch(`${API}/api/playback/${videoId}/playback`, { headers: { authorization: `Bearer ${token}` } })
  const j = await r.json().catch(() => ({}))
  return {
    status: r.status,
    kind: j?.playback?.kind ?? null,
    stopsAt: j?.playback?.stopsAtSeconds ?? j?.access?.freePreviewSeconds ?? null,
    canWatchFull: j?.access?.canWatchFull ?? null,
    price: j?.access?.priceTzs ?? null,
    duration: j?.durationSeconds ?? null,
  }
}

async function videoMeta(slug) {
  const r = await fetch(`${API}/api/videos/${slug}`)
  const j = await r.json().catch(() => ({}))
  return j?.video || j || {}
}

/** currentTime inside whichever frame is the Cloudflare player. */
async function playerState(page) {
  for (const f of page.frames()) {
    if (!/videodelivery|cloudflarestream/.test(f.url())) continue
    const s = await f.evaluate(() => {
      const v = document.querySelector('video')
      return v ? { t: v.currentTime, paused: v.paused, ready: v.readyState } : null
    }).catch(() => null)
    if (s) return s
  }
  return null
}

async function seekTo(page, seconds) {
  for (let i = 0; i < 40; i++) {
    for (const f of page.frames()) {
      if (!/videodelivery|cloudflarestream/.test(f.url())) continue
      const done = await f.evaluate((to) => {
        const v = document.querySelector('video')
        if (!v || v.readyState < 1) return false
        v.currentTime = to
        return true
      }, seconds).catch(() => false)
      if (done) return true
    }
    await page.waitForTimeout(400)
  }
  return false
}

async function signIn(page, ctx, email, password) {
  /**
   * Sign OUT first, and mean it.
   *
   * The login page bounces a visitor who is already signed in — correctly, it is
   * what stops you logging in twice. So a run that inherited the previous run's
   * session never saw the form at all: it was redirected away, this function
   * returned true, and the run went on to test the PREVIOUS run's account, which
   * had already bought the film. That is how Pixel 7 run 2 reported "no Unlock
   * button" on a page that was quietly saying "Purchased during the premiere".
   *
   * Whether it happened at all came down to a race — whether AuthContext had
   * resolved before the form rendered — which is why the same harness passed
   * five times on one profile and failed on the next.
   */
  await ctx.clearCookies()
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear() } catch {} }).catch(() => {})
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForSelector('#login-id', { timeout: 30000 })
  /* Let the auth panel finish arriving before touching it. Without this the
     first Pixel 7 run died on "element is not stable / detached from the DOM":
     the submit button was still being moved by the panel's entrance animation
     and then replaced by a re-render, and Playwright — correctly — refuses to
     click a moving target. That is the harness racing the page, not a defect. */
  await page.waitForTimeout(1500)
  await page.evaluate(AUTOFILL('#login-id', email))
  await page.evaluate(AUTOFILL('#login-pass', password))
  const submit = page.locator('button[type=submit]').first()
  try {
    await submit.click({ timeout: 15000 })
  } catch {
    // Still moving. The values are already in the DOM, so submitting the form
    // itself posts exactly what a click would have.
    await page.evaluate(() => document.querySelector('form')?.requestSubmit?.())
  }
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(500)
    if (!new URL(page.url()).pathname.startsWith('/login')) return true
  }
  return false
}

/* ------------------------------------------- a viewer who has never paid */

async function createViewer(engine) {
  const stamp = Date.now().toString().slice(-10)
  const account = { email: `e2e+buy${stamp}@mtonyo.test`, password: `E2e-Buy-${stamp}!`, name: `E2E Buyer ${stamp}` }
  const browser = await pw[engine].launch()
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
  await page.goto(`${BASE}/signup`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForSelector('#signup-email', { timeout: 30000 })
  await page.evaluate(AUTOFILL('#signup-name', account.name))
  await page.evaluate(AUTOFILL('#signup-phone', '0712345678')).catch(() => {})
  await page.evaluate(AUTOFILL('#signup-email', account.email))
  await page.evaluate(AUTOFILL('#signup-pass', account.password))
  const boxes = page.locator('input[type=checkbox]')
  for (let i = 0; i < await boxes.count(); i++) {
    const c = boxes.nth(i)
    if (!(await c.isChecked().catch(() => true))) await c.check({ force: true }).catch(() => {})
  }
  await page.locator('button[type=submit]').first().click()
  await page.waitForTimeout(10000)
  const landedOn = page.url()
  const shown = await page.locator('.form-error').first().textContent({ timeout: 500 }).catch(() => null)
  await browser.close()
  const token = await apiToken(account.email, account.password)
  return { ...account, landedOn, shown, token }
}

/* --------------------------------------------------------------- run it */

const buyMeta = await videoMeta(BUY)
const secondMeta = await videoMeta(SECOND)
const buyId = buyMeta.id
const secondId = secondMeta.id
console.log(`video under test:   ${BUY} -> ${buyId}`)
console.log(`second paid title:  ${SECOND} → ${secondId}`)

/**
 * ONE FRESH VIEWER PER PROFILE, not one shared between them.
 *
 * The first assertion of this journey is that the film is locked, and a shared
 * account would own it after the first profile — every later profile would then
 * be testing a video it had already bought, which is the one thing this must not
 * do. Four accounts, four genuine first purchases. They are listed at the end
 * and reversed by `server/scripts/cleanup-e2e.mjs`.
 */
const summary = []
const accounts = []

for (const name of only) {
  const profile = PROFILES[name]
  if (!profile) { console.log(`  (no such profile: ${name})`); continue }
  console.log(`\n${'='.repeat(66)}\n### ${name}${profile.full ? '' : '   — layout + sheet only (no MSE here)'}\n${'='.repeat(66)}`)
  const browser = await pw[profile.engine].launch({
    args: profile.engine === 'chromium' ? ['--autoplay-policy=no-user-gesture-required'] : [],
  })
  const ctx = await browser.newContext({ ...profile.opts })
  const page = await ctx.newPage()

  /* B3 — every request this journey makes, stamped, so a per-minute peak can be
     read off afterwards rather than guessed at. */
  const reqs = []
  let saw429 = 0
  page.on('request', (r) => { if (r.url().includes('/api/')) reqs.push({ t: Date.now(), url: r.url().split('?')[0].split('/api')[1] }) })
  page.on('response', (r) => { if (r.status() === 429) saw429 += 1 })

 for (let run = 1; run <= RUNS; run++) {
  const firstRun = run === 1
  if (RUNS > 1) console.log(`
  ---------- run ${run} of ${RUNS}`)
  const row = { profile: name, run }
  const t0 = Date.now()

  console.log('  --- a viewer who has never paid for anything')
  const viewer = await createViewer('chromium')
  accounts.push({ profile: name, ...viewer })
  console.log(`  ${viewer.email}   landed on ${new URL(viewer.landedOn).pathname}${viewer.shown ? `   (${viewer.shown.trim().slice(0, 80)})` : ''}`)
  if (!check(Boolean(viewer.token), 'the new account can sign in through the API')) { await browser.close(); continue }
  const before = await entitlement(viewer.token, buyId)
  // The cut-off comes from the server, not from a constant here: a preview this
  // harness guessed wrong would seek past the stop and prove nothing.
  const previewSec = Number(before.stopsAt ?? 20)
  check(before.kind !== 'full', `before paying the server grants kind=${before.kind}, canWatchFull=${before.canWatchFull}, cut-off ${previewSec}s of ${before.duration}s`)

  await signIn(page, ctx, viewer.email, viewer.password)
  await page.goto(`${BASE}/watch/${BUY}`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForTimeout(4000)

  /* ---- the preview, and where it stops --------------------------------- */
  let stoppedAt = null
  if (profile.full) {
    await seekTo(page, Math.max(1, previewSec - 6))
    for (let i = 0; i < 70; i++) {
      const s = await playerState(page)
      if (s && s.paused && s.t >= previewSec - 4) { stoppedAt = s.t; break }
      await page.waitForTimeout(500)
    }
    if (stoppedAt === null) {
      // Say whether there was a player at all, so a stalled Cloudflare frame is
      // never reported as "the preview does not stop".
      const frames = page.frames().filter((f) => /videodelivery|cloudflarestream/.test(f.url())).length
      console.log(`        no player state: ${frames} Cloudflare frame(s) on the page`)
    }
    check(stoppedAt !== null, `the preview stops by itself at ${stoppedAt?.toFixed?.(1)}s (cut-off ${previewSec}s)`)
    row.stoppedAt = stoppedAt
  }

  /* ---- the paywall, and the sheet --------------------------------------
     One reload before giving up. A watch page that has not produced its Unlock
     button in thirty seconds has not loaded, and a harness that throws there
     reports "the paywall is broken" for what is a slow cold start — while a
     harness that silently retries for ever would hide a real one. So: retry
     once, and say that it was retried. */
  const unlock = page.locator('button', { hasText: /unlock/i }).first()
  let unlockSeen = await unlock.isVisible({ timeout: 30000 }).catch(() => false)
  let reloaded = false
  if (!unlockSeen) {
    reloaded = true
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 })
    await page.waitForTimeout(4000)
    unlockSeen = await unlock.isVisible({ timeout: 30000 }).catch(() => false)
  }
  if (!check(unlockSeen, `the paywall offers Unlock${reloaded ? ' (after one reload)' : ''}`)) {
    const diag = await page.evaluate(() => ({
      url: location.pathname,
      buttons: [...document.querySelectorAll('button')].map((b) => b.textContent.trim().slice(0, 24)).filter(Boolean).slice(0, 12),
      frames: document.querySelectorAll('iframe').length,
      body: document.body.innerText.replace(/[\s ]+/g, ' ').trim().slice(0, 160),
    })).catch(() => null)
    console.log(`        page state: ${JSON.stringify(diag)}`)
    summary.push(row)
    continue
  }
  row.reloadedForPaywall = reloaded
  await unlock.click()
  await page.waitForSelector('.pay-modal', { timeout: 20000 })
  check(true, 'the payment sheet opens')

  const layout = await page.evaluate(() => {
    const card = document.querySelector('.pay-modal .modal-card')
    const phone = document.querySelector('#pay-phone')
    const pay = [...document.querySelectorAll('.pay-modal button')].find((b) => /^Pay\b/.test(b.textContent.trim()))
    const vv = window.visualViewport
    const box = (el) => { const r = el?.getBoundingClientRect(); return r ? { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) } : null }
    return {
      vw: Math.round(vv?.width ?? innerWidth), vh: Math.round(vv?.height ?? innerHeight),
      card: box(card), phone: box(phone), pay: box(pay),
      cardScrolls: card ? card.scrollHeight > card.clientHeight + 1 : null,
    }
  })
  row.layout = layout
  check(Boolean(layout.phone), 'the number field is in the sheet')
  check(Boolean(layout.pay) && layout.pay.bottom <= layout.vh + 1 && layout.pay.top >= 0,
    `the Pay button is on screen (${layout.pay?.top}–${layout.pay?.bottom} of ${layout.vh})`)
  if (layout.vw <= 400) {
    check(!layout.cardScrolls, `the sheet fits ${layout.vw}x${layout.vh} without scrolling`)
  }

  /* ---- B2: what the keyboard does -------------------------------------- */
  if (layout.vw <= 400) {
    await page.locator('#pay-phone').focus()
    await page.waitForTimeout(400)
    // interactive-widget=resizes-content: the keyboard shortens the layout
    // viewport. Emulate exactly that — a soft keyboard cannot be raised here.
    const kbd = Math.round(layout.vh * 0.48)
    await page.setViewportSize({ width: layout.vw, height: layout.vh - kbd })
    await page.waitForTimeout(900)
    await page.evaluate(() => document.querySelector('#pay-phone')?.scrollIntoView({ block: 'center' }))
    await page.waitForTimeout(700)
    const withKbd = await page.evaluate(() => {
      const phone = document.querySelector('#pay-phone')
      const pay = [...document.querySelectorAll('.pay-modal button')].find((b) => /^Pay\b/.test(b.textContent.trim()))
      const card = document.querySelector('.pay-modal .modal-card')
      const box = (el) => { const r = el?.getBoundingClientRect(); return r ? { top: Math.round(r.top), bottom: Math.round(r.bottom) } : null }
      return {
        vh: Math.round(window.visualViewport?.height ?? innerHeight),
        phone: box(phone), pay: box(pay),
        cardBottom: box(card)?.bottom, cardScrolls: card ? card.scrollHeight > card.clientHeight + 1 : null,
      }
    })
    row.withKeyboard = withKbd
    check(Boolean(withKbd.phone) && withKbd.phone.top >= 0 && withKbd.phone.bottom <= withKbd.vh + 1,
      `with the keyboard up the number field is visible (${withKbd.phone?.top}–${withKbd.phone?.bottom} of ${withKbd.vh})`)
    check(Boolean(withKbd.pay) && withKbd.pay.top < withKbd.vh && withKbd.pay.bottom > 0,
      `with the keyboard up the Pay button is on screen (${withKbd.pay?.top}–${withKbd.pay?.bottom} of ${withKbd.vh})`)
    await page.setViewportSize({ width: layout.vw, height: layout.vh })
    await page.waitForTimeout(700)
  }

  /* ---- pay -------------------------------------------------------------
     Type the number, the way a person does, rather than leaning on the sandbox
     pre-fill. That pre-fill only appears once `/api/stats/platform` has come
     back and told the sheet it is in test mode; a Pay tap that beats it finds an
     empty field and a validation error, which is correct behaviour and useless
     as a test. Real M-Pesa in Milestone 3 has no pre-fill at all, so typing is
     also the journey that will still exist then. */
  await page.locator('#pay-phone').fill('0712345678')
  const payBtn = page.locator('.pay-modal button[type=submit]').first()
  const tPay = Date.now()
  await payBtn.click()
  let closed = null
  for (let i = 0; i < 160; i++) {
    await page.waitForTimeout(250)
    if (!(await page.locator('.pay-modal').count())) { closed = Date.now() - tPay; break }
  }
  if (closed === null) {
    // Say what the sheet was showing instead of leaving the next reader to guess.
    const stuck = await page.locator('.pay-modal .modal-card').first().textContent({ timeout: 1000 }).catch(() => null)
    console.log(`        sheet still open, showing: ${(stuck || '').replace(/\s+/g, ' ').trim().slice(0, 160)}`)
  }
  check(closed !== null, `the sheet closes itself${closed !== null ? ` after ${closed} ms` : ' — it did not'}`)
  row.sheetClosedMs = closed

  /* ---- entitlement, from the API, before anything is claimed ----------- */
  const after = await entitlement(viewer.token, buyId)
  check(after.kind === 'full', `/api/playback/${BUY} now returns kind=${after.kind}`)
  row.kindAfter = after.kind

  /* ---- and only then, the picture -------------------------------------- */
  if (profile.full && stoppedAt !== null) {
    let resumed = null
    for (let i = 0; i < 20; i++) {
      const s = await playerState(page)
      if (s && s.t >= stoppedAt - 2 && !s.paused) { resumed = s; break }
      resumed = s
      await page.waitForTimeout(250)
    }
    row.resumedAt = resumed?.t
    check(Boolean(resumed) && resumed.t >= stoppedAt - 2,
      `the film continues from the stop point (${resumed?.t?.toFixed?.(1)}s vs ${stoppedAt?.toFixed?.(1)}s) within 5 s of the sheet closing`)
    check(Boolean(resumed) && !resumed.paused, 'and it is playing, with no second Play button')
  }

  /* ---- everything below is proved once, on run 1 ----------------------- */
  if (!firstRun) {
    summary.push(row)
    await ctx.clearCookies()
    await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear() } catch {} }).catch(() => {})
    continue
  }

  /* ---- My Library ------------------------------------------------------ */
  await page.goto(`${BASE}/dashboard?tab=library`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForTimeout(7000)
  const inLibrary = await page.locator(`a[href*="/watch/${BUY}"]`).count()
  check(inLibrary > 0, `My Library lists it (${inLibrary} link${inLibrary === 1 ? '' : 's'})`)

  /* ---- log out, log back in, still full -------------------------------- */
  await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear() } catch {} })
  await ctx.clearCookies()
  const backIn = await signIn(page, ctx, viewer.email, viewer.password)
  check(backIn, 'signs back in with one submit')
  const afterRelogin = await entitlement(await apiToken(viewer.email, viewer.password), buyId)
  check(afterRelogin.kind === 'full', `after logout→login it is still kind=${afterRelogin.kind}`)

  /* ---- a second paid title is still locked ----------------------------- */
  const secondKind = await entitlement(viewer.token, secondId)
  check(secondKind.kind !== 'full', `a second paid title stays locked (kind=${secondKind.kind})`)
  await page.goto(`${BASE}/watch/${SECOND}`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForTimeout(5000)
  const secondLocked = await page.locator('button', { hasText: /unlock/i }).first().isVisible({ timeout: 15000 }).catch(() => false)
  check(secondLocked, 'and it still shows its own Unlock button')

  /* ---- declined, then cancelled ---------------------------------------- */
  for (const outcome of ['declined', 'cancelled']) {
    if (!(await page.locator('.pay-modal').count())) {
      await page.locator('button', { hasText: /unlock/i }).first().click()
      await page.waitForSelector('.pay-modal', { timeout: 20000 })
    }
    const label = outcome === 'declined' ? /Test declined/i : /Test cancelled/i
    await page.locator('.pay-modal button', { hasText: label }).first().click()
    let msg = null
    for (let i = 0; i < 100; i++) {
      await page.waitForTimeout(250)
      const t = await page.locator('.pay-failed').first().textContent({ timeout: 400 }).catch(() => null)
      if (t) { msg = t.replace(/\s+/g, ' ').trim(); break }
    }
    check(Boolean(msg), `"Test ${outcome}" reaches a failure screen`)
    check(Boolean(msg) && /try again/i.test(msg), `and says what happened + offers Try again — "${(msg || '').slice(0, 100)}"`)
    const stillLocked = await entitlement(viewer.token, secondId)
    check(stillLocked.kind !== 'full', `the video is still locked after a ${outcome} payment (kind=${stillLocked.kind})`)
    await page.locator('.pay-failed button', { hasText: /try again/i }).first().click()
    await page.waitForTimeout(900)
    const backToForm = await page.locator('.pay-modal #pay-phone').count()
    check(backToForm > 0, 'Try again returns to the form')
  }
  await page.keyboard.press('Escape').catch(() => {})

  /* ---- B3 — what the limiter saw --------------------------------------- */
  const span = Date.now() - t0
  let peak = 0
  for (const r of reqs) peak = Math.max(peak, reqs.filter((x) => x.t >= r.t && x.t < r.t + 60_000).length)
  const byPath = {}
  for (const r of reqs) byPath[r.url] = (byPath[r.url] || 0) + 1
  row.requests = reqs.length
  row.peakPerMin = peak
  row.spanSec = Math.round(span / 1000)
  console.log(`\n  B3 — ${reqs.length} API requests over ${row.spanSec}s; busiest 60 s window: ${peak} of 120`)
  console.log('     ' + Object.entries(byPath).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k}×${v}`).join('  '))
  check(peak < 120, `the whole journey fits inside the limiter with ${120 - peak} to spare`)
  check(saw429 === 0, `nothing was rate limited (${saw429} × 429)`)

  summary.push(row)
 }
  await browser.close()
}

console.log(`\n${'='.repeat(66)}\n### summary`)
for (const r of summary) {
  console.log(`  ${(r.profile + (r.run > 1 ? ` #${r.run}` : '')).padEnd(21)} sheet closed ${String(r.sheetClosedMs).padStart(5)} ms  kind=${r.kindAfter}  ${r.resumedAt != null ? `resumed ${r.resumedAt.toFixed(1)}s (stop ${r.stoppedAt?.toFixed(1)}s)` : ''}  ${r.requests} req, peak ${r.peakPerMin}/min`)
}
console.log('')
console.log('accounts created by this run (reverse with server/scripts/cleanup-e2e.mjs):')
for (const a of accounts) console.log(`  ${a.profile.padEnd(18)} ${a.email}  ${a.password}`)
console.log(fails.length ? `\n${fails.length} FAILURE(S):\n  - ${fails.join('\n  - ')}` : '\nALL PASS')
process.exit(fails.length ? 1 : 0)
