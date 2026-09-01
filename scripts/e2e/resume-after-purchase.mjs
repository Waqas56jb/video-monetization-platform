/**
 * A2, resume leg — the scenario the brief actually describes.
 *
 * The first run clicked Unlock seven seconds in, so the viewer had watched seven
 * seconds and the film resumed at seven seconds. That is resumePoint behaving
 * exactly as written ("paid without watching → start at the beginning"), not a
 * defect — but it does not test resuming FROM THE PREVIEW STOP. This one lets
 * the preview run to its cut-off first.
 */
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE)
const BASE = 'https://video-monetization-platform-chi.vercel.app'
const API = 'https://video-monetization-platform-production.up.railway.app'
const SLUG = process.env.SLUG || 'behind-the-fame-a-coast-documentary'
const STOPS_AT = Number(process.env.STOPS_AT || 217)
const EMAIL = process.env.E2E_EMAIL, PASSWORD = process.env.E2E_PASSWORD
const ok = (c, m) => console.log(`  ${c ? 'PASS' : 'FAIL'}  ${m}`)

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] })
const page = await (await browser.newContext()).newPage()
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 90000 })
await page.locator('input[name=email]').fill(EMAIL)
await page.locator('input[name=password]').fill(PASSWORD)
await page.locator('button', { hasText: /log in as viewer/i }).first().click()
await page.waitForTimeout(6000)

await page.goto(`${BASE}/watch/${SLUG}`, { waitUntil: 'domcontentloaded', timeout: 90000 })
console.log(`\n### watch the preview to its cut-off (${STOPS_AT}s), then buy`)
// seek near the stop instead of waiting 3.6 minutes of wall clock
let seeked = false
for (let i = 0; i < 60 && !seeked; i++) {
  for (const f of page.frames()) {
    if (!/videodelivery|cloudflarestream/.test(f.url())) continue
    const done = await f.evaluate((to) => {
      const v = document.querySelector('video')
      if (!v || v.readyState < 1) return false
      v.currentTime = to
      return true
    }, STOPS_AT - 6).catch(() => false)
    if (done) seeked = true
  }
  if (!seeked) await page.waitForTimeout(400)
}
ok(seeked, 'seeked the preview to 6 s before its cut-off')

// let it run into the stop so the page records the paywall position
let halted = null
for (let i = 0; i < 60; i++) {
  for (const f of page.frames()) {
    if (!/videodelivery|cloudflarestream/.test(f.url())) continue
    const s = await f.evaluate(() => { const v = document.querySelector('video'); return v ? { t: v.currentTime, paused: v.paused } : null }).catch(() => null)
    if (s) halted = s
  }
  if (halted && halted.paused && halted.t >= STOPS_AT - 3) break
  await page.waitForTimeout(500)
}
console.log(`  preview halted at ${halted?.t?.toFixed?.(1)}s paused=${halted?.paused}`)
ok(halted !== null && halted.t >= STOPS_AT - 4, `preview reached its cut-off (${halted?.t?.toFixed?.(1)}s)`)

await page.locator('button', { hasText: /unlock/i }).first().click()
await page.waitForTimeout(3000)
const pay = page.locator('button', { hasText: /^Pay TZS/i }).first()
ok(await pay.count() > 0, 'payment sheet open with a Pay button')
const t0 = Date.now()
await pay.click()

/**
 * Wait for the PURCHASE, not for a number.
 *
 * The first version of this checked `currentTime >= 215` straight after the
 * click and passed in 302 ms — on the paused preview, which was already sitting
 * at 216.9 s. The assertion was satisfied by the thing it was supposed to be
 * measuring the replacement of. Ask the server whether it sold the film first.
 */
const tokenOf = () => page.evaluate(() => localStorage.getItem('mtonyo.access'))
let ownedAt = null
for (let i = 0; i < 60; i++) {
  const t = await tokenOf()
  const r = await fetch(`${API}/api/playback/${SLUG}/playback`, { headers: { Authorization: `Bearer ${t}` } })
    .then((x) => x.json()).catch(() => null)
  if (r?.access?.owned === true && r?.playback?.kind === 'full') { ownedAt = Date.now() - t0; break }
  await page.waitForTimeout(1000)
}
ok(ownedAt !== null, `server reports owned + kind:full after ${ownedAt ?? '>60000'} ms`)

let resumed = null
const deadline = Date.now() + 20000
while (Date.now() < deadline) {
  for (const f of page.frames()) {
    if (!/videodelivery|cloudflarestream/.test(f.url())) continue
    const s = await f.evaluate(() => { const v = document.querySelector('video'); return v ? { t: v.currentTime, paused: v.paused } : null }).catch(() => null)
    if (s && !s.paused && s.t > 0) resumed = s
  }
  if (resumed && resumed.t >= STOPS_AT - 2) break
  await page.waitForTimeout(500)
}
console.log(`  after checkout: ${JSON.stringify(resumed)}  (${Date.now() - t0} ms since Pay)`)
ok(resumed !== null && resumed.t >= STOPS_AT - 2, `full film PLAYING from ${resumed?.t?.toFixed?.(1) ?? '—'}s ≥ ${STOPS_AT - 2}`)

const tok = await page.evaluate(() => localStorage.getItem('mtonyo.access'))
const pb = await (await fetch(`${API}/api/playback/${SLUG}/playback`, { headers: { Authorization: `Bearer ${tok}` } })).json()
ok(pb?.playback?.kind === 'full', `kind = ${pb?.playback?.kind}`)
ok(pb?.access?.owned === true, `owned = ${pb?.access?.owned}`)
const unlock = await page.locator('button', { hasText: /unlock/i }).first().isVisible().catch(() => false)
ok(unlock === false, 'no Unlock CTA after purchase')
await browser.close(); process.exit(0)
