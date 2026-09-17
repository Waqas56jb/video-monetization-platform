/**
 * What is on screen in the player box, every ~300ms, from navigation to
 * playback — and how WHITE it is.
 *
 * Written for the client's "white screen when a video or advert starts"
 * report (2026-09-17). Pixel 7 profile, CPU throttled 4x, optionally a
 * 3G-class network, against production. Each row is a change of state:
 * which iframes exist (film / ad), whether each is revealed (`is-painted`),
 * whether the poster is showing, the advert's own state, and the share of
 * near-white pixels in a screenshot of the player box. The network list at
 * the end says when Cloudflare's embed script and first media segments
 * actually arrived, so a white beat can be laid against its cause.
 *
 *   PLAYWRIGHT_MODULE=file:///… node scripts/e2e/probe-player-white.mjs
 *   NET=3g SLUGS=ugali-samaki-sunday-cooking node scripts/e2e/probe-player-white.mjs
 */
const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const { chromium, devices } = pw
const BASE = process.env.BASE || 'https://video-monetization-platform-chi.vercel.app'
const CPU = Number(process.env.CPU || 4)
const NET = process.env.NET || 'none' // none | 3g
const SLUGS = (process.env.SLUGS || 'ugali-samaki-sunday-cooking,live-at-arusha-full-set').split(',')
const SECONDS = Number(process.env.SECONDS || 24)

for (const slug of SLUGS) {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ ...devices['Pixel 7'] })
  const page = await ctx.newPage()
  const meter = await ctx.newPage()
  await meter.goto('about:blank')
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU })
  if (NET === '3g') {
    await cdp.send('Network.enable')
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 })
  }
  const t0 = Date.now()
  const net = []
  page.on('response', (r) => {
    const u = r.url()
    if (/cloudflarestream\.com|videodelivery\.net/.test(u) || /\/api\/(playback|ads|videos)\//.test(u)) {
      const short = u.replace(/^https?:\/\//, '').replace(/\?.*$/, '').slice(0, 90)
      net.push(`${String(Date.now() - t0).padStart(6)}ms ${r.status()} ${short}`)
    }
  })
  console.log(`\n######## ${slug} · CPU x${CPU} · net=${NET} ########`)
  await page.goto(`${BASE}/watch/${slug}`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  const rows = []
  let last = ''
  let whiteMs = 0
  let firstWhite = null
  let lastSample = Date.now()
  while (Date.now() - t0 < SECONDS * 1000) {
    const state = await page.evaluate(() => {
      const ad = document.querySelector('.ad-stage')
      const frames = [...document.querySelectorAll('iframe.stream-frame')].map((f) => ({
        where: f.closest('.ad-stage') ? 'ad' : 'film',
        painted: f.classList.contains('is-painted'),
        opacity: getComputedStyle(f).opacity,
      }))
      const posters = [...document.querySelectorAll('.stream-poster')].map((p) => ({ where: p.closest('.ad-stage') ? 'ad' : 'film', hidden: p.classList.contains('is-hidden'), opacity: getComputedStyle(p).opacity, loaded: p.tagName === 'IMG' ? p.complete && p.naturalWidth > 0 : 'div' }))
      const note = document.querySelector('.ad-loading-note')?.textContent || ''
      const booting = Boolean(document.querySelector('.stream-shell.is-booting'))
      return { ad: ad ? ad.dataset.adState : null, frames, posters, note, booting }
    }).catch(() => null)
    const box = await page.locator('.player').first().boundingBox().catch(() => null)
    let lum = null
    if (box && box.width > 10 && box.height > 10) {
      const buf = await page.screenshot({ clip: box, type: 'jpeg', quality: 60 }).catch(() => null)
      if (buf) {
        lum = await meter.evaluate((dataUrl) => new Promise((res) => {
          const img = new Image()
          img.onload = () => {
            const c = document.createElement('canvas'); c.width = img.width; c.height = img.height
            const x = c.getContext('2d'); x.drawImage(img, 0, 0)
            const d = x.getImageData(0, 0, c.width, c.height).data
            let sum = 0, white = 0
            const n = d.length / 4
            for (let i = 0; i < d.length; i += 4) { const l = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000; sum += l; if (l > 235) white++ }
            res({ mean: Math.round(sum / n), whitePct: Math.round((100 * white) / n) })
          }
          img.src = dataUrl
        }), `data:image/jpeg;base64,${buf.toString('base64')}`).catch(() => null)
      }
    }
    const now = Date.now()
    const dt = now - lastSample
    lastSample = now
    if (lum && lum.whitePct >= 50) { whiteMs += dt; if (firstWhite == null) firstWhite = now - t0 }
    const desc = state
      ? `ad=${state.ad ?? '-'} note="${state.note}" boot=${state.booting ? 'y' : 'n'} frames=[${state.frames.map((f) => `${f.where}:${f.painted ? 'painted' : 'clear'}/op${f.opacity}`).join(' ')}] posters=[${state.posters.map((p) => `${p.where}:${p.hidden ? 'hidden' : 'shown'}/op${p.opacity}/${p.loaded}`).join(' ')}]`
      : 'no-dom'
    const l = lum ? `lum=${String(lum.mean).padStart(3)} white=${String(lum.whitePct).padStart(3)}%` : 'lum=?'
    const key = `${desc}|${lum ? (lum.whitePct >= 50 ? 'W' : lum.mean < 40 ? 'D' : 'M') : '?'}`
    if (key !== last) { rows.push(`${String(now - t0).padStart(6)}ms ${l}  ${desc}`); last = key }
    await page.waitForTimeout(120)
  }
  console.log(rows.join('\n'))
  console.log(`--- white (>=50% near-white pixels): first at ${firstWhite == null ? 'never' : firstWhite + 'ms'}, total ${whiteMs}ms`)
  console.log('--- network (cloudflarestream + api):')
  console.log(net.slice(0, 40).join('\n'))
  await browser.close()
}
