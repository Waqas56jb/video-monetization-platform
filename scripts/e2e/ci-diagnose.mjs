/**
 * Why does the journey matrix fail on the GitHub runner and pass on a laptop?
 *
 * Every completed run of .github/workflows/journeys.yml since it was written
 * failed at the same step, in two clusters: the Chromium profiles never saw
 * playback time advance ("content reaches —s"), and Linux WebKit never
 * rendered the Home cards. The same script passes on Windows. This prints,
 * from inside the runner, the facts that decide it:
 *
 *   - for each Chromium launch (Playwright's build, and Google Chrome when
 *     installed): can the page decode H.264/AAC at all, and does the
 *     Cloudflare player's <video> advance on the Free + Ads watch page;
 *   - for WebKit (desktop and iPhone 14): every console error, page error and
 *     failed request while Home loads, and what the DOM looks like every 10s
 *     for a minute — preloader, cards, links.
 *
 *   node scripts/e2e/ci-diagnose.mjs           (PLAYWRIGHT_MODULE=playwright)
 */
const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const { chromium, webkit, devices } = pw
const BASE = process.env.BASE || 'https://video-monetization-platform-chi.vercel.app'
const FREE_SLUG = process.env.FREE_SLUG || 'how-to-cook-pilau-properly'

const say = (...a) => console.log(...a)

async function chromiumCase(label, launchOpts) {
  say(`\n### chromium · ${label}`)
  let browser
  try {
    browser = await chromium.launch({ ...launchOpts, args: ['--autoplay-policy=no-user-gesture-required'] })
  } catch (err) {
    say(`  launch failed: ${String(err).split('\n')[0]}`)
    return
  }
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  say(`  version: ${browser.version()}`)
  await page.goto('about:blank')
  const codecs = await page.evaluate(() => {
    const v = document.createElement('video')
    return {
      h264: v.canPlayType('video/mp4; codecs="avc1.42E01E"'),
      aac: v.canPlayType('audio/mp4; codecs="mp4a.40.2"'),
      mseH264: typeof MediaSource !== 'undefined' && MediaSource.isTypeSupported('video/mp4; codecs="avc1.42E01E, mp4a.40.2"'),
      hlsNative: v.canPlayType('application/vnd.apple.mpegurl'),
      ua: navigator.userAgent,
    }
  })
  say(`  codecs: ${JSON.stringify(codecs)}`)
  await page.goto(`${BASE}/watch/${FREE_SLUG}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  let last = null
  for (let i = 0; i < 45; i++) {
    for (const f of page.frames()) {
      if (!/videodelivery|cloudflarestream/.test(f.url())) continue
      const s = await f
        .evaluate(() => {
          const v = document.querySelector('video')
          return v ? { t: v.currentTime, paused: v.paused, ready: v.readyState, err: v.error ? `${v.error.code}:${v.error.message}` : null, src: (v.currentSrc || '').slice(0, 60) } : null
        })
        .catch(() => null)
      if (s) last = s
    }
    if (last && last.t > 0.2) break
    await page.waitForTimeout(1000)
  }
  say(`  player after ${last ? 'poll' : '45s'}: ${JSON.stringify(last)}`)
  say(`  verdict: ${last && last.t > 0.2 ? 'PLAYS' : 'DOES NOT PLAY'}`)
  await browser.close()
}

async function webkitCase(label, opts) {
  say(`\n### webkit · ${label}`)
  let browser
  try {
    browser = await webkit.launch()
  } catch (err) {
    say(`  launch failed: ${String(err).split('\n')[0]}`)
    return
  }
  const ctx = await browser.newContext({ ...opts })
  const page = await ctx.newPage()
  say(`  version: ${browser.version()}`)
  const notes = []
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') notes.push(`console.${m.type()}: ${m.text().slice(0, 200)}`) })
  page.on('pageerror', (e) => notes.push(`pageerror: ${String(e).slice(0, 300)}`))
  page.on('requestfailed', (r) => notes.push(`requestfailed: ${r.url().slice(0, 120)} — ${r.failure()?.errorText}`))
  page.on('response', (r) => { if (r.status() >= 400) notes.push(`http ${r.status()}: ${r.url().slice(0, 120)}`) })
  const t0 = Date.now()
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 120000 }).catch((e) => notes.push(`goto: ${String(e).split('\n')[0]}`))
  for (let i = 0; i < 6; i++) {
    const dom = await page
      .evaluate(() => ({
        ready: document.readyState,
        preloader: (() => { const p = document.getElementById('preloader'); return p ? `${getComputedStyle(p).display}/${getComputedStyle(p).opacity}/${getComputedStyle(p).visibility}` : 'none' })(),
        pageClass: document.querySelector('.page')?.className || null,
        cards: document.querySelectorAll('.vid-card').length,
        watchLinks: document.querySelectorAll('a[href*="/watch/"]').length,
        skeletons: document.querySelectorAll('.skeleton').length,
        trending: Boolean(document.getElementById('trending')),
        textLength: document.body?.innerText?.length || 0,
        title: document.title,
      }))
      .catch((e) => ({ evalError: String(e).split('\n')[0] }))
    say(`  +${Math.round((Date.now() - t0) / 1000)}s ${JSON.stringify(dom)}`)
    if (dom.watchLinks > 0) break
    await page.waitForTimeout(10000)
  }
  say(`  notes (${notes.length}):`)
  for (const n of notes.slice(0, 40)) say(`    ${n}`)
  await browser.close()
}

await chromiumCase("Playwright's build (default headless)", {})
await chromiumCase("Playwright's build, channel=chromium (new headless)", { channel: 'chromium' })
await chromiumCase('Google Chrome, channel=chrome', { channel: 'chrome' })
await webkitCase('desktop 1440×900', { viewport: { width: 1440, height: 900 } })
await webkitCase('iPhone 14', { ...devices['iPhone 14'] })
say('\ndone')
