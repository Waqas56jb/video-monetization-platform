/**
 * D — the cross-browser journey matrix, against production.
 *
 * ON THE NUMBERING. PROMPT-7's Part E is not in this repository — it was a
 * brief, not a file — so journeys 1–10 and 13 are reconstructed here from the
 * client's reported faults and the work done against them, and each one says in
 * its own title what it actually checks. 11 and 12 are skipped as instructed and
 * are named anyway, because "skipped" and "does not exist" are different things
 * and the checklist for a real device depends on knowing which.
 *
 * AGAINST PRODUCTION, NEVER A PREVIEW. Two independent settings make a preview
 * deployment untestable: the API's CORS_ORIGINS names only the two production
 * hostnames, so every call from a preview is 403 before it reaches a route; and
 * Cloudflare Stream's allowed-domains list does not include preview hostnames,
 * so the player frame answers "This video has not been configured to be allowed
 * on this domain." A suite pointed at a preview would fail almost every journey
 * for reasons that have nothing to do with the code. Working in PLAYER-MEASURE.md.
 *
 * WHAT RUNS WHERE, and why it is not the same everywhere.
 * Playwright's WebKit has no Media Source Extensions and no native HLS, so
 * Cloudflare's player never decodes a frame on it and no assertion about
 * playback, adverts, resume or unlocking means anything there (DECISIONS.md,
 * 2026-09-01). Firefox is included for layout and navigation for the same
 * reason it is worth having at all — a third engine catches a different class of
 * mistake — but it is not the client's browser and it is not evidence about it.
 *
 *   playback + purchase journeys   chromium only (desktop, Pixel 7, Fast 3G)
 *   layout / tap / login journeys  all six profiles
 *
 * MODES.
 *   --read-only   no login, no purchase. What CI runs on every push to main.
 *   (default)     everything, using the e2e account.
 *
 *   PLAYWRIGHT_MODULE=file:///… E2E_EMAIL=… E2E_PASSWORD=… node scripts/e2e/matrix.mjs
 *   node scripts/e2e/matrix.mjs --read-only
 *   PROFILES="webkit desktop" JOURNEYS=1,2,13 node scripts/e2e/matrix.mjs
 */
const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const { devices } = pw

const BASE = process.env.BASE || 'https://video-monetization-platform-chi.vercel.app'
const API = process.env.API || 'https://video-monetization-platform-production.up.railway.app'
const READ_ONLY = process.argv.includes('--read-only') || process.env.READ_ONLY === '1'
const EMAIL = process.env.E2E_EMAIL
const PASSWORD = process.env.E2E_PASSWORD

const FREE_SLUG = process.env.FREE_SLUG || 'how-to-cook-pilau-properly'
const PAID_SLUG = process.env.PAID_SLUG || 'live-at-arusha-full-set'

/* ------------------------------------------------------------- profiles */

const PROFILES = [
  { name: 'webkit desktop', engine: 'webkit', plays: false, opts: { viewport: { width: 1440, height: 900 } } },
  { name: 'iPhone 14', engine: 'webkit', plays: false, opts: { ...devices['iPhone 14'] } },
  {
    name: 'iPad Pro 11 + mouse',
    engine: 'webkit',
    plays: false,
    /* Touch AND a pointer. An iPad with a Magic Keyboard reports `hover: hover`,
       which is what made the first tap land on a hover state instead of the
       link — the exact profile the client was using. */
    opts: { ...devices['iPad Pro 11'], hasTouch: true, isMobile: false },
  },
  { name: 'chromium desktop', engine: 'chromium', plays: true, opts: { viewport: { width: 1440, height: 900 } } },
  { name: 'Pixel 7', engine: 'chromium', plays: true, opts: { ...devices['Pixel 7'] } },
  { name: 'firefox desktop', engine: 'firefox', plays: false, opts: { viewport: { width: 1440, height: 900 } } },
  {
    name: 'chromium Fast 3G',
    engine: 'chromium',
    plays: true,
    throttle: true,
    opts: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 3 },
  },
]

const onlyProfiles = process.env.PROFILES ? process.env.PROFILES.split(',').map((s) => s.trim()) : null
const onlyJourneys = process.env.JOURNEYS ? process.env.JOURNEYS.split(',').map((s) => Number(s.trim())) : null

/* -------------------------------------------------------------- helpers */

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
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear() } catch {} }).catch(() => {})
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForSelector('#login-id', { timeout: 40000 })
  await page.waitForTimeout(1500)
  await page.evaluate(AUTOFILL('#login-id', EMAIL))
  await page.evaluate(AUTOFILL('#login-pass', PASSWORD))
  try { await page.locator('button[type=submit]').first().click({ timeout: 15000 }) }
  catch { await page.evaluate(() => document.querySelector('form')?.requestSubmit?.()) }
  for (let i = 0; i < 80; i++) {
    await page.waitForTimeout(500)
    if (!new URL(page.url()).pathname.startsWith('/login')) return true
  }
  return false
}

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

const noOverflow = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)

/* ------------------------------------------------------------ journeys */

const JOURNEYS = [
  {
    n: 1,
    title: 'Home renders real cards, and nothing scrolls sideways',
    everywhere: true,
    async run({ page, t }) {
      await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 120000 })
      await page.waitForSelector('a[href*="/watch/"]', { timeout: 60000 })
      const cards = await page.locator('a[href*="/watch/"]').count()
      t(cards > 0, `${cards} cards`)
      t((await noOverflow(page)) <= 0, 'no horizontal overflow')
    },
  },
  {
    n: 2,
    title: 'Explore loads and its category filter changes the grid',
    everywhere: true,
    async run({ page, t }) {
      await page.goto(`${BASE}/explore`, { waitUntil: 'domcontentloaded', timeout: 120000 })
      await page.waitForSelector('.vid-card', { timeout: 60000 })
      const before = await page.locator('.vid-card').count()
      t(before > 0, `${before} cards`)
      /* Click a category, then clear it and require the grid to come back.
         The first version asserted `after >= 0`, which is true of every number
         and tested nothing — a filter that wiped the page for ever would have
         passed it. The round trip is the assertion: filtering changes the grid,
         and clearing the filter restores it. */
      const chips = page.locator('.chip[aria-pressed]')
      const chipCount = await chips.count()
      if (chipCount > 1) {
        await chips.nth(1).click()
        await page.waitForTimeout(3500)
        const filtered = await page.locator('.vid-card').count()
        const chipName = (await chips.nth(1).textContent())?.trim()
        t(
          (await chips.nth(1).getAttribute('aria-pressed')) === 'true',
          `"${chipName}" is selected (${before} → ${filtered} cards)`
        )
        await chips.nth(0).click()
        await page.waitForTimeout(3500)
        const restored = await page.locator('.vid-card').count()
        t(restored === before, `clearing the filter brings the grid back (${filtered} → ${restored})`)
      } else {
        t(false, `expected category chips on Explore, found ${chipCount}`)
      }
      t((await noOverflow(page)) <= 0, 'no horizontal overflow')
    },
  },
  {
    n: 3,
    title: 'A card opens its own watch page on the first tap',
    everywhere: true,
    async run({ page, t, profile }) {
      /**
       * TAP THE PICTURE, not the title.
       *
       * This journey used to click `.vid-open` — the title link — and passed on
       * every profile while the poster, which is what anyone actually taps, did
       * nothing at all: `.vid-play` covered the whole thumbnail above the
       * stretched link and swallowed the tap. The client found that; this suite
       * did not, because it was pressing the one part of the card that was never
       * broken. The big target is the one worth testing.
       */
      for (const [what, sel] of [['the poster', '.vid-thumb'], ['the title', '.vid-open']]) {
        await page.goto(`${BASE}/explore`, { waitUntil: 'domcontentloaded', timeout: 120000 })
        await page.waitForSelector('.vid-card .vid-open', { timeout: 60000 })
        await page.waitForTimeout(2500)
        const before = page.url()
        /**
         * Press the COORDINATE, not the element.
         *
         * `locator.click()` refuses when a different element would receive the
         * event — and the link that opens the card correctly covers the poster,
         * so Playwright reports "intercepts pointer events" and times out. That
         * refusal is the overlay working. A finger lands at a point and whatever
         * is on top gets it, so that is what this does.
         */
        const target = page.locator(`.vid-card ${sel}`).first()
        await target.scrollIntoViewIfNeeded().catch(() => {})
        await page.waitForTimeout(400)
        const box = await target.boundingBox()
        const vp = page.viewportSize()
        const px = box.x + box.width / 2
        /* Clamp inside the window: the price row can sit past the bottom edge,
           and pressing a point outside the window proves nothing. */
        const py = Math.min(box.y + box.height / 2, vp.height - 6)
        /* One press. On an iPad with a mouse the first used to be swallowed
           applying a hover state. */
        if (profile.opts.hasTouch) await page.touchscreen.tap(px, py)
        else await page.mouse.click(px, py)
        await page.waitForTimeout(4000)
        t(
          page.url() !== before && /\/watch\//.test(page.url()),
          `${what} opens the video on tap #1 (${page.url() === before ? 'DID NOT NAVIGATE' : new URL(page.url()).pathname})`
        )
      }
    },
  },
  {
    n: 4,
    title: 'The watch page never looks frozen — a poster, then words, then a retry',
    everywhere: true,
    async run({ page, t }) {
      await page.goto(`${BASE}/watch/${FREE_SLUG}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
      await page.waitForTimeout(3000)
      /**
       * The classes the page actually renders, not invented ones.
       *
       * The first version looked for `.watch-stage, .player-shell, .ph-stage,
       * iframe`. Three of those four do not exist in this codebase, so the
       * assertion was really "the Cloudflare iframe has attached within three
       * seconds" — a timing test wearing a "never blank" label. It passed on
       * four profiles because the iframe happened to be quick and failed on the
       * iPad because it was not, which told us nothing about either.
       *
       * What the page actually puts on screen while it waits is
       * `.stream-shell.is-booting` with a poster inside it, then `.stream-boot`
       * carrying the words. Once playback resolves, the iframe. Any of those is
       * "not a blank box"; the absence of all of them is the reported fault.
       */
      const shown = await page.evaluate(() => ({
        shell: Boolean(document.querySelector('.stream-shell')),
        poster: Boolean(document.querySelector('.stream-poster')),
        words: document.querySelector('.stream-boot-msg')?.textContent?.trim() || null,
        frame: document.querySelectorAll('iframe').length,
        fallback: Boolean(document.querySelector('.stream-fallback')),
      }))
      t(
        shown.shell || shown.poster || shown.frame > 0 || shown.fallback,
        `something is on screen at 3 s — shell:${shown.shell} poster:${shown.poster} frame:${shown.frame}` +
        `${shown.words ? ` words:"${shown.words}"` : ''}`
      )
      t((await noOverflow(page)) <= 0, 'no horizontal overflow')
    },
  },
  {
    n: 5,
    title: 'A free + ads title plays, and the advert overlay clears',
    chromiumOnly: true,
    async run({ page, t }) {
      await page.goto(`${BASE}/watch/${FREE_SLUG}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
      let playing = null
      for (let i = 0; i < 90; i++) {
        const s = await playerState(page)
        if (s && s.t > 0.2) { playing = s; break }
        await page.waitForTimeout(1000)
      }
      t(Boolean(playing), `content reaches ${playing?.t?.toFixed?.(1) ?? '—'}s`)
      const overlay = await page.locator('.ad-overlay, .adbreak, [class*="advert"]').count()
      t(overlay === 0, 'no advert overlay left on screen')
    },
  },
  {
    n: 6,
    title: 'A paid preview stops by itself and offers Unlock',
    chromiumOnly: true,
    async run({ page, t }) {
      const meta = await (await fetch(`${API}/api/playback/${PAID_SLUG}/playback`)).json()
      const stopsAt = Number(meta?.playback?.stopsAtSeconds ?? meta?.access?.freePreviewSeconds ?? 60)
      await page.goto(`${BASE}/watch/${PAID_SLUG}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
      await page.waitForTimeout(5000)
      for (let i = 0; i < 50; i++) {
        let done = false
        for (const f of page.frames()) {
          if (!/videodelivery|cloudflarestream/.test(f.url())) continue
          done = await f.evaluate((to) => {
            const v = document.querySelector('video')
            if (!v || v.readyState < 1) return false
            v.currentTime = to
            return true
          }, Math.max(1, stopsAt - 5)).catch(() => false)
        }
        if (done) break
        await page.waitForTimeout(400)
      }
      let halted = null
      for (let i = 0; i < 70; i++) {
        const s = await playerState(page)
        if (s && s.paused && s.t >= stopsAt - 4) { halted = s; break }
        await page.waitForTimeout(500)
      }
      t(Boolean(halted), `preview halts at ${halted?.t?.toFixed?.(1) ?? '—'}s (cut-off ${stopsAt}s)`)
      const unlock = await page.locator('button', { hasText: /unlock/i }).first().isVisible().catch(() => false)
      t(unlock, 'the paywall offers Unlock')
    },
  },
  {
    n: 7,
    title: 'Login in one attempt, and back to the page you were on',
    everywhere: true,
    needsAccount: true,
    async run({ page, ctx, t }) {
      await page.goto(`${BASE}/watch/${FREE_SLUG}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
      await page.waitForTimeout(3000)
      const burger = page.locator('button.hamburger').first()
      if (await burger.isVisible().catch(() => false)) {
        await burger.click()
        await page.waitForTimeout(500)
        await page.locator('button', { hasText: /^\s*Log in\s*$/i }).last().click()
      } else {
        await page.locator('.nav-cta-login').first().click()
      }
      await page.waitForTimeout(1500)
      t(decodeURIComponent(page.url()).includes(`/watch/${FREE_SLUG}`), 'the login URL carries the video')
      await page.waitForSelector('#login-id', { timeout: 40000 })
      /* Filled the way autofill fills: DOM value set, no event dispatched. */
      await page.evaluate(`(() => {
        const set = (el, v) => { const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value'); d.set.call(el, v) }
        set(document.querySelector('#login-id'), ${JSON.stringify(EMAIL)})
        set(document.querySelector('#login-pass'), ${JSON.stringify(PASSWORD)})
      })()`)
      await page.locator('button[type=submit]').first().click()
      let landed = null
      for (let i = 0; i < 80; i++) {
        await page.waitForTimeout(500)
        const u = new URL(page.url())
        if (!u.pathname.startsWith('/login')) { landed = u.pathname; break }
      }
      t(landed === `/watch/${FREE_SLUG}`, `one submit → ${landed}`)
    },
  },
  {
    n: 8,
    title: 'A purchase unlocks the film and it continues from the stop point',
    chromiumOnly: true,
    needsAccount: true,
    async run({ page, ctx, t }) {
      /* This account already owns the paid title, so this journey checks that
         the entitlement HOLDS — the buying of it is proved five times over in
         scripts/e2e/purchase-journey.mjs with viewers who have never paid. */
      await signIn(page, ctx)
      const tok = await fetch(`${API}/api/auth/login`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: EMAIL, password: PASSWORD, side: 'viewer' }),
      }).then((r) => r.json()).then((j) => j?.session?.accessToken)
      const meta = await (await fetch(`${API}/api/videos/${PAID_SLUG}`)).json()
      const ent = await (await fetch(`${API}/api/playback/${meta.video.id}/playback`, {
        headers: { authorization: `Bearer ${tok}` },
      })).json()
      t(ent?.playback?.kind === 'full', `the server grants kind=${ent?.playback?.kind}`)
      await page.goto(`${BASE}/watch/${PAID_SLUG}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
      let playing = null
      for (let i = 0; i < 90; i++) {
        const s = await playerState(page)
        if (s && s.t > 0.2) { playing = s; break }
        await page.waitForTimeout(1000)
      }
      t(Boolean(playing), `the owned film plays (${playing?.t?.toFixed?.(1) ?? '—'}s)`)
      const unlock = await page.locator('button', { hasText: /unlock/i }).first().isVisible().catch(() => false)
      t(!unlock, 'and there is no paywall on it')
    },
  },
  {
    n: 9,
    title: 'My Library shows four rows and the purchase survives a fresh session',
    everywhere: true,
    needsAccount: true,
    async run({ page, ctx, t }) {
      await signIn(page, ctx)
      await page.goto(`${BASE}/dashboard?tab=library`, { waitUntil: 'domcontentloaded', timeout: 120000 })
      await page.waitForSelector('.lib-row', { timeout: 60000 })
      await page.waitForTimeout(4000)
      const rows = await page.locator('.lib-row-head h3').allTextContents()
      t(rows.includes('Purchased'), `rows: ${rows.join(' · ')}`)
      const bought = await page.locator('.lib-row').filter({ hasText: 'Purchased' }).locator('.vid-card').count()
      t(bought > 0, `${bought} purchased titles, after a fresh sign-in`)
    },
  },
  {
    n: 10,
    title: 'Share opens with a real card, and the creator page is reachable',
    everywhere: true,
    async run({ page, t }) {
      await page.goto(`${BASE}/watch/${FREE_SLUG}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
      await page.waitForTimeout(5000)
      await page.locator('button', { hasText: /share/i }).first().click()
      const sheet = await page.locator('.share-modal').first()
        .waitFor({ state: 'visible', timeout: 30000 }).then(() => true).catch(() => false)
      t(sheet, 'the share sheet opens')
      if (sheet) {
        const wa = await page.locator('.share-modal').locator('text=/whatsapp/i').count()
        t(wa > 0, 'with WhatsApp in it')
        /**
         * Close it the way a person does, and WAIT for it to be gone.
         *
         * This pressed Escape and waited 800 ms, which made the journey
         * intermittent on the iPhone profile: one run in two, the creator link
         * underneath was still behind the closing sheet and the click sat there
         * until it timed out. The sheet's own close button plus a wait for the
         * element to detach removes the race instead of lengthening the guess.
         */
        const close = page.locator('.share-modal .modal-x, .share-modal .share-xbtn').first()
        if (await close.count()) await close.click({ timeout: 10000 }).catch(() => {})
        else await page.keyboard.press('Escape').catch(() => {})
        await page.locator('.share-modal').first()
          .waitFor({ state: 'detached', timeout: 15000 })
          .catch(async () => {
            await page.keyboard.press('Escape').catch(() => {})
            await page.waitForTimeout(1200)
          })
      }
      const creator = page.locator('.creator-row .creator-open').first()
      if (await creator.count()) {
        await creator.click()
        await page.waitForTimeout(3500)
        t(/\/creator\//.test(page.url()), `creator page reachable (${new URL(page.url()).pathname})`)
      } else {
        t(false, 'no creator link on the watch page')
      }
    },
  },
  {
    n: 11,
    title: 'A WhatsApp share actually sent from a phone',
    skip: 'needs a real device — no headless browser can hand a link to WhatsApp',
  },
  {
    n: 12,
    title: 'iOS Low Power Mode',
    skip: 'needs a real device — Low Power Mode cannot be emulated',
  },
  {
    n: 13,
    title: 'Back from a video to Home is quick, and nothing overflows on the way',
    everywhere: true,
    async run({ page, t }) {
      await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 120000 })
      await page.waitForSelector('a[href*="/watch/"]', { timeout: 60000 })
      await page.waitForTimeout(1500)
      await page.locator('a[href*="/watch/"]').first().click()
      await page.waitForTimeout(4000)
      const t0 = Date.now()
      await page.goBack({ waitUntil: 'domcontentloaded', timeout: 60000 })
      await page.waitForSelector('a[href*="/watch/"]', { timeout: 60000 })
      const ms = Date.now() - t0
      t(ms < 6000, `back to Home in ${ms} ms`)
      t((await noOverflow(page)) <= 0, 'no horizontal overflow')
    },
  },
]

/* ------------------------------------------------------------------ run */

const results = []
console.log(`\nMTONYO+ cross-browser matrix — ${READ_ONLY ? 'READ-ONLY' : 'FULL'} · ${BASE}\n`)

for (const profile of PROFILES) {
  if (onlyProfiles && !onlyProfiles.includes(profile.name)) continue
  let browser
  try {
    browser = await pw[profile.engine].launch({
      args: profile.engine === 'chromium' ? ['--autoplay-policy=no-user-gesture-required'] : [],
    })
  } catch (err) {
    console.log(`### ${profile.name}\n  SKIP  engine unavailable: ${String(err).split('\n')[0].slice(0, 90)}\n`)
    for (const j of JOURNEYS) if (!j.skip) results.push({ profile: profile.name, n: j.n, state: 'skip', note: 'engine unavailable' })
    continue
  }
  console.log(`### ${profile.name}${profile.throttle ? '  (Fast 3G)' : ''}`)

  for (const j of JOURNEYS) {
    if (onlyJourneys && !onlyJourneys.includes(j.n)) continue
    if (j.skip) {
      console.log(`  ${String(j.n).padStart(2)}  SKIP  ${j.title} — ${j.skip}`)
      results.push({ profile: profile.name, n: j.n, state: 'skip', note: j.skip })
      continue
    }
    if (j.chromiumOnly && !profile.plays) {
      console.log(`  ${String(j.n).padStart(2)}  n/a   ${j.title} — this engine cannot decode (no MSE)`)
      results.push({ profile: profile.name, n: j.n, state: 'n/a', note: 'no MSE on this engine' })
      continue
    }
    if (j.needsAccount && (READ_ONLY || !EMAIL)) {
      console.log(`  ${String(j.n).padStart(2)}  n/a   ${j.title} — needs an account`)
      results.push({ profile: profile.name, n: j.n, state: 'n/a', note: 'read-only run' })
      continue
    }

    const ctx = await browser.newContext({ ...profile.opts })
    const page = await ctx.newPage()
    if (profile.throttle && profile.engine === 'chromium') {
      /* Fast 3G, the same numbers DevTools uses. */
      const cdp = await ctx.newCDPSession(page)
      await cdp.send('Network.enable')
      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 150,
        downloadThroughput: (1.6 * 1024 * 1024) / 8,
        uploadThroughput: (750 * 1024) / 8,
      })
    }

    const notes = []
    let failed = false
    const t = (cond, note) => { notes.push(`${cond ? '' : '!'}${note}`); if (!cond) failed = true }
    try {
      await j.run({ page, ctx, t, profile })
    } catch (err) {
      failed = true
      notes.push(`!threw: ${String(err).split('\n')[0].slice(0, 90)}`)
    }
    await ctx.close()
    const state = failed ? 'FAIL' : 'pass'
    console.log(`  ${String(j.n).padStart(2)}  ${failed ? 'FAIL' : 'pass'}  ${j.title}`)
    for (const nte of notes) console.log(`        ${nte.startsWith('!') ? '✗ ' + nte.slice(1) : '· ' + nte}`)
    results.push({ profile: profile.name, n: j.n, state, note: notes.join(' | ') })
  }
  console.log('')
  await browser.close()
}

/* ------------------------------------------------------------- summary */

const profiles = [...new Set(results.map((r) => r.profile))]
const numbers = [...new Set(results.map((r) => r.n))].sort((a, b) => a - b)
console.log('### matrix')
console.log(`  ${'journey'.padEnd(8)}${profiles.map((p) => p.slice(0, 13).padEnd(15)).join('')}`)
for (const n of numbers) {
  const cells = profiles.map((p) => {
    const r = results.find((x) => x.profile === p && x.n === n)
    return (r ? { pass: 'pass', FAIL: 'FAIL', skip: 'skip', 'n/a': 'n/a' }[r.state] : '-').padEnd(15)
  })
  console.log(`  ${String(n).padEnd(8)}${cells.join('')}`)
}

const failures = results.filter((r) => r.state === 'FAIL')
console.log(
  `\n  ${results.filter((r) => r.state === 'pass').length} pass · ${failures.length} fail · ` +
  `${results.filter((r) => r.state === 'n/a').length} not applicable · ` +
  `${results.filter((r) => r.state === 'skip').length} skipped (a real device)`
)
if (failures.length) {
  console.log('\nFAILURES')
  for (const f of failures) console.log(`  ${f.profile} · journey ${f.n}: ${f.note}`)
}
process.exit(failures.length ? 1 : 0)
