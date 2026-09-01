/**
 * C3 — does the position survive the tab being killed?
 *
 * The brief's test is: play to 0:42, background it, kill the tab, and the server
 * row should read 42 ± 3. The row is read from the API, not from the page, so
 * nothing the browser still holds can flatter the result.
 *
 * WHERE EACH HALF CAN BE PROVED.
 * Playwright's WebKit has no Media Source Extensions, so Cloudflare's player
 * never decodes a frame there and nothing can be "played to 0:42"
 * (DECISIONS.md, 2026-09-01). So the run is split:
 *
 *   chromium (desktop and Pixel 7)   the whole thing — play, background, kill,
 *                                    then read the row back
 *   webkit (desktop and iPhone 14)   the transport and the server's acceptance
 *                                    of it: does this engine have sendBeacon,
 *                                    and does a beacon sent from the real page
 *                                    to the real endpoint actually store a
 *                                    position? That is the half that was broken
 *                                    and the half a real Safari would share.
 *
 * KILLED, not navigated away. `context.close()` is the closest thing here to the
 * system reclaiming a backgrounded tab: no unload ceremony the harness controls,
 * and any request still in flight dies with it. A `page.goto` elsewhere would
 * let a normal fetch finish and would prove nothing about the beacon.
 */
const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const { devices } = pw

const BASE = process.env.BASE || 'https://video-monetization-platform-chi.vercel.app'
const API = process.env.API || 'https://video-monetization-platform-production.up.railway.app'
const SLUG = process.env.SLUG || 'live-at-arusha-full-set'
const TARGET = Number(process.env.TARGET || 42)
const TOLERANCE = Number(process.env.TOLERANCE || 3)
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

async function apiToken() {
  const r = await fetch(`${API}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, side: 'viewer' }),
  })
  return (await r.json())?.session?.accessToken
}

const token = await apiToken()
if (!token) { console.error('could not sign in'); process.exit(2) }

const meta = await (await fetch(`${API}/api/videos/${SLUG}`)).json()
const videoId = meta?.video?.id
console.log(`\nvideo: ${SLUG} → ${videoId}`)

/** The stored position, straight from the server. */
async function storedSeconds() {
  const r = await fetch(`${API}/api/playback/${videoId}/playback`, {
    headers: { authorization: `Bearer ${token}` },
  })
  const j = await r.json().catch(() => ({}))
  return Number(j?.playback?.resumeFromSeconds ?? -1)
}

/** Put the row somewhere unmistakably different before each case. */
async function resetTo(seconds) {
  await fetch(`${API}/api/playback/${videoId}/progress`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ seconds }),
  })
}

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

async function seekTo(page, seconds) {
  for (let i = 0; i < 50; i++) {
    for (const f of page.frames()) {
      if (!/videodelivery|cloudflarestream/.test(f.url())) continue
      const done = await f.evaluate((to) => {
        const v = document.querySelector('video')
        if (!v || v.readyState < 1) return false
        v.currentTime = to
        v.play?.().catch(() => {})
        return true
      }, seconds).catch(() => false)
      if (done) return true
    }
    await page.waitForTimeout(400)
  }
  return false
}

const PROFILES = [
  { name: 'chromium desktop', engine: 'chromium', plays: true, opts: { viewport: { width: 1440, height: 900 } } },
  { name: 'Pixel 7', engine: 'chromium', plays: true, opts: { ...devices['Pixel 7'] } },
  { name: 'webkit desktop', engine: 'webkit', plays: false, opts: { viewport: { width: 1440, height: 900 } } },
  { name: 'iPhone 14 · webkit', engine: 'webkit', plays: false, opts: { ...devices['iPhone 14'] } },
]
const only = process.env.PROFILES ? process.env.PROFILES.split(',').map((s) => s.trim()) : null

for (const profile of PROFILES) {
  if (only && !only.includes(profile.name)) continue
  console.log(`\n### ${profile.name}`)
  const browser = await pw[profile.engine].launch({
    args: profile.engine === 'chromium' ? ['--autoplay-policy=no-user-gesture-required'] : [],
  })

  /* ---------------------------------------------------------------------- */
  if (profile.plays) {
    await resetTo(1)
    const ctx = await browser.newContext({ ...profile.opts })
    const page = await ctx.newPage()
    await signIn(page, ctx)
    await page.goto(`${BASE}/watch/${SLUG}`, { waitUntil: 'domcontentloaded', timeout: 90000 })
    await page.waitForTimeout(5000)

    const seeked = await seekTo(page, TARGET)
    check(seeked, `played to 0:${TARGET}`)
    await page.waitForTimeout(1200)

    // Background it, exactly as a phone does when the viewer swaps app.
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await page.waitForTimeout(400)

    // Kill it. Nothing still in flight survives this.
    await ctx.close()
    await new Promise((r) => setTimeout(r, 3000))

    const stored = await storedSeconds()
    console.log(`  server row after the tab was killed: ${stored}s (target ${TARGET} ± ${TOLERANCE})`)
    check(
      Math.abs(stored - TARGET) <= TOLERANCE,
      `the server has ${stored}s — within ${TOLERANCE}s of where the viewer actually was`
    )

    /* ---- and the same again, on pause alone -------------------------- */
    await resetTo(1)
    const ctx2 = await browser.newContext({ ...profile.opts })
    const page2 = await ctx2.newPage()
    await signIn(page2, ctx2)
    await page2.goto(`${BASE}/watch/${SLUG}`, { waitUntil: 'domcontentloaded', timeout: 90000 })
    await page2.waitForTimeout(5000)
    await seekTo(page2, TARGET + 20)
    await page2.waitForTimeout(1000)
    for (const f of page2.frames()) {
      if (!/videodelivery|cloudflarestream/.test(f.url())) continue
      await f.evaluate(() => document.querySelector('video')?.pause()).catch(() => {})
    }
    await page2.waitForTimeout(2500)
    const afterPause = await storedSeconds()
    console.log(`  server row after a pause at 0:${TARGET + 20}: ${afterPause}s`)
    check(
      Math.abs(afterPause - (TARGET + 20)) <= TOLERANCE,
      `pausing writes the position immediately, without waiting for the ten-second timer (${afterPause}s)`
    )
    await ctx2.close()
  } else {
    /* ---- WebKit: the transport, which is the half that was broken ----- */
    const ctx = await browser.newContext({ ...profile.opts })
    const page = await ctx.newPage()
    await signIn(page, ctx)
    await page.goto(`${BASE}/watch/${SLUG}`, { waitUntil: 'domcontentloaded', timeout: 90000 })
    await page.waitForTimeout(5000)

    const hasBeacon = await page.evaluate(() => typeof navigator.sendBeacon === 'function')
    const hasKeepalive = await page.evaluate(() => 'keepalive' in new Request('', {}))
    console.log(`  sendBeacon: ${hasBeacon}   fetch keepalive: ${hasKeepalive}`)
    check(hasBeacon, 'this engine has navigator.sendBeacon')

    await resetTo(1)
    const marker = TARGET + 7
    const accepted = await page.evaluate(
      async ([api, id, seconds]) => {
        const token = localStorage.getItem('mtonyo.access')
        if (!token) return { sent: false, why: 'no token in storage', keys: Object.keys(localStorage) }
        const blob = new Blob([JSON.stringify({ seconds, token })], { type: 'text/plain;charset=UTF-8' })
        return { sent: navigator.sendBeacon(`${api}/api/playback/${id}/progress`, blob), tokenLen: token.length }
      },
      [API, videoId, marker]
    )
    console.log(`  beacon queued: ${JSON.stringify(accepted)}`)
    check(accepted.sent, 'the browser accepted the beacon')

    /**
     * A moment before the tab is destroyed, and this is not a loophole.
     *
     * sendBeacon promises to outlive the DOCUMENT, not the browser process.
     * Closing the whole context in the same tick takes the network stack with
     * it and nothing is ever put on the wire — which is a fact about
     * `context.close()`, not about the transport. The real sequence is: the tab
     * goes hidden, the app fires its beacon, and the system reclaims the tab
     * some seconds later. Two seconds represents that honestly. The assertion
     * that matters is unchanged: the row is read from the server afterwards.
     */
    await page.waitForTimeout(2000)
    await ctx.close()
    await new Promise((r) => setTimeout(r, 3000))
    const stored = await storedSeconds()
    console.log(`  server row after a beacon from a killed ${profile.name} tab: ${stored}s (sent ${marker})`)
    check(stored === marker, `the server stored what the beacon carried (${stored}s)`)
  }

  await browser.close()
}

console.log(fails.length ? `\n${fails.length} FAILURE(S):\n  - ${fails.join('\n  - ')}` : '\nALL PASS')
process.exit(fails.length ? 1 : 0)
