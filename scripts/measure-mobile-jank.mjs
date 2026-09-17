/**
 * "The mobile freezes in so many areas" — measured, page by page, before
 * anything is changed.
 *
 * Pixel 7 profile with the CPU throttled 4x (roughly a mid-range Android),
 * against production. For each page: long tasks (>50ms main-thread blocks)
 * during load and their total, then a scripted scroll through the page
 * watching frame gaps — a "freeze" is a gap where the next frame simply
 * does not come. Reported per page so a fix can be aimed at a cause.
 *
 *   PLAYWRIGHT_MODULE=file:///… node scripts/measure-mobile-jank.mjs
 *   CPU=6 PAGES=/,/explore node scripts/measure-mobile-jank.mjs
 */
const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const { chromium, devices } = pw

const BASE = process.env.BASE || 'https://video-monetization-platform-chi.vercel.app'
const CPU = Number(process.env.CPU || 4)
const PAGES = (process.env.PAGES || '/,/explore,/watch/ugali-samaki-sunday-cooking,/watch/live-at-arusha-full-set,/creator-capital,/login')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const PROBE = `
  window.__lt = []
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__lt.push({ start: Math.round(e.startTime), dur: Math.round(e.duration) })
    }).observe({ type: 'longtask', buffered: true })
  } catch {}
`

async function measure(path) {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ ...devices['Pixel 7'] })
  const page = await ctx.newPage()
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU })
  await page.addInitScript(PROBE)

  const t0 = Date.now()
  await page.goto(`${BASE}${path}`, { waitUntil: 'load', timeout: 90000 })
  const loadMs = Date.now() - t0
  await page.waitForTimeout(2500)

  const loadTasks = await page.evaluate(() => window.__lt.slice())

  /* Scroll the page in the way a thumb does — a burst, a pause, a burst —
     and watch the frame clock. Gaps over 100ms are frames that did not come. */
  const scroll = await page.evaluate(async () => {
    const gaps = []
    let last = performance.now()
    let raf = true
    const tick = (now) => {
      gaps.push(now - last)
      last = now
      if (raf) requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    const max = Math.max(0, document.documentElement.scrollHeight - innerHeight)
    const startTasks = window.__lt.length
    for (let y = 0; y <= max; y += Math.max(60, innerHeight / 6)) {
      window.scrollTo(0, y)
      await new Promise((r) => setTimeout(r, 70))
    }
    await new Promise((r) => setTimeout(r, 400))
    raf = false
    const scrollTasks = window.__lt.slice(startTasks)
    const bad = gaps.filter((g) => g > 100)
    return {
      frames: gaps.length,
      jankFrames: bad.length,
      worstGapMs: Math.round(Math.max(0, ...gaps)),
      longTasks: scrollTasks.length,
      longTaskMs: scrollTasks.reduce((n, t) => n + t.dur, 0),
      scrollHeight: max + innerHeight,
    }
  })

  await browser.close()
  const tbt = loadTasks.reduce((n, t) => n + Math.max(0, t.dur - 50), 0)
  return { path, loadMs, loadLongTasks: loadTasks.length, loadTbtMs: tbt, loadWorstMs: Math.max(0, ...loadTasks.map((t) => t.dur)), ...scroll }
}

console.log(`Mobile jank · Pixel 7 · CPU x${CPU} · ${BASE} · ${new Date().toISOString()}\n`)
console.log('  page                                 load   LT#  TBT   worst | scroll: frames jank  worstGap  LT#  LTms')
for (const path of PAGES) {
  try {
    const r = await measure(path)
    console.log(
      `  ${path.padEnd(36)} ${String(r.loadMs).padStart(5)}  ${String(r.loadLongTasks).padStart(3)} ${String(r.loadTbtMs).padStart(5)} ${String(r.loadWorstMs).padStart(6)} | ` +
        `${String(r.frames).padStart(6)} ${String(r.jankFrames).padStart(4)}  ${String(r.worstGapMs).padStart(7)}  ${String(r.longTasks).padStart(3)} ${String(r.longTaskMs).padStart(5)}`
    )
  } catch (err) {
    console.log(`  ${path.padEnd(36)} ERROR ${err.message.split('\n')[0]}`)
  }
}
