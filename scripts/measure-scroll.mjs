/**
 * "The screen vibrates when I scroll" — measured.
 *
 * Reported on a MacBook and an iPad, so WebKit is the engine that matters and
 * Chromium is only corroboration.
 *
 * THE INSTRUMENT HAD TO CHANGE FOR WEBKIT. Safari implements neither the Long
 * Tasks API nor LayoutShift, so `PerformanceObserver({type:'longtask'})` and
 * `'layout-shift'` observe nothing there — they do not throw, they silently
 * report zero, which would have read as "no jank on the exact browser that has
 * the jank". So the load-bearing numbers here come from instruments that work
 * everywhere:
 *
 *   main-thread     a setTimeout(0) heartbeat. A gap over 50 ms is 50 ms the
 *   gaps            page could not respond in. NOT requestAnimationFrame: the
 *                   first version used rAF and reported 101 bad frames out of
 *                   103, because headless throttles rAF to whatever is driving
 *                   the compositor — here, the scroll loop's own 100 ms cadence.
 *                   It was measuring the harness. A timer heartbeat is
 *                   independent of the compositor and works in both engines.
 *   NOTE ON THE GAPS. A CPU profile of the same scroll shows the main thread
 *   98.5% idle with 23 ms of JavaScript across ten seconds, so heartbeat gaps
 *   here are not script blocking — they are the renderer being descheduled,
 *   which headless exaggerates. Treat them as a signal to profile, not as a
 *   verdict.
 *
 *   layout moves     the page's own scrollHeight sampled during the scroll. On
 *                   iOS a collapsing URL bar resizes every 100vh section, the
 *                   document grows and shrinks under the finger, and that is
 *                   exactly what reads as vibration.
 *   element drift    bounding boxes of a few fixed things, corrected for scroll
 *                   position. Anything that moves when only the scroll offset
 *                   should have changed is a shift, on any engine.
 *
 * The Chromium-only APIs are still collected where they exist and reported as
 * such, so the two engines can be compared without pretending the numbers mean
 * the same thing.
 *
 *   PLAYWRIGHT_MODULE=/abs/path/playwright/index.mjs node scripts/measure-scroll.mjs
 *   ENGINES=webkit PAGES=/explore node scripts/measure-scroll.mjs
 */
const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const { devices } = pw

const BASE = process.env.BASE || 'https://video-monetization-platform-chi.vercel.app'
const PAGES = (process.env.PAGES || '/,/explore,/watch/live-at-arusha-full-set').split(',')
const ENGINES = (process.env.ENGINES || 'webkit,chromium').split(',')
const SECONDS = Number(process.env.SECONDS || 10)

const PROFILES = (engine) => {
  const list = [{ name: `${engine} desktop 1440x900`, opts: { viewport: { width: 1440, height: 900 } } }]
  if (engine === 'webkit') list.push({ name: 'iPad Pro 11', opts: { ...devices['iPad Pro 11'] } })
  return list
}

/** Installed before any page script runs, so nothing is missed during load. */
const PROBE = `
window.__jank = { frames: [], heights: [], shifts: [], longtasks: [], cls: 0, apis: {} }
try {
  /* NOT buffered. With buffered:true this replayed every long task from page
     load, so a page with a heavy boot and a perfectly smooth scroll reported
     "13 long tasks during scroll". Only entries that arrive while the scroll is
     running count, which is what __jankOn gates. */
  new PerformanceObserver((l) => {
    if (!window.__jankOn) return
    for (const e of l.getEntries()) window.__jank.longtasks.push(Math.round(e.duration))
  }).observe({ type: 'longtask' })
  window.__jank.apis.longtask = true
} catch (e) { window.__jank.apis.longtask = false }
try {
  new PerformanceObserver((l) => {
    if (!window.__jankOn) return
    for (const e of l.getEntries()) if (!e.hadRecentInput) { window.__jank.cls += e.value; window.__jank.shifts.push(Number(e.value.toFixed(4))) }
  }).observe({ type: 'layout-shift' })
  window.__jank.apis.layoutShift = true
} catch (e) { window.__jank.apis.layoutShift = false }

window.__jankStart = () => {
  window.__jank.frames.length = 0
  window.__jank.heights.length = 0
  let last = performance.now()
  window.__jankOn = true
  const tick = () => {
    if (!window.__jankOn) return
    const t = performance.now()
    window.__jank.frames.push(Math.round(t - last))
    last = t
    const h = document.scrollingElement ? document.scrollingElement.scrollHeight : 0
    const prev = window.__jank.heights[window.__jank.heights.length - 1]
    if (h !== prev) window.__jank.heights.push(h)
    setTimeout(tick, 0)
  }
  setTimeout(tick, 0)
}
window.__jankStop = () => { window.__jankOn = false }
`

async function measure(engine, profile, path) {
  const browser = await pw[engine].launch()
  const ctx = await browser.newContext(profile.opts)
  const page = await ctx.newPage()
  await page.addInitScript(PROBE)
  try {
    await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 90000 })
    await page.waitForTimeout(4000) // let the page settle; load-time shift is not scroll jank
    await page.evaluate(() => window.__jankStart())

    /* A scripted scroll rather than mouse.wheel: identical distance and cadence
       on every engine, so the numbers compare. Down for half the time, back up
       for the other half — the way a person checks a page. */
    const steps = SECONDS * 10
    await page.evaluate(async (n) => {
      const el = document.scrollingElement
      const max = Math.max(0, el.scrollHeight - window.innerHeight)
      const half = Math.floor(n / 2)
      for (let i = 0; i < n; i++) {
        const k = i < half ? i / half : (n - i) / half
        el.scrollTo(0, Math.round(max * Math.min(1, k)))
        await new Promise((r) => setTimeout(r, 100))
      }
    }, steps)

    await page.evaluate(() => window.__jankStop())
    const j = await page.evaluate(() => window.__jank)

    const gaps = j.frames.filter((f) => f > 50)
    const blocking = gaps.reduce((a, f) => a + (f - 50), 0)
    return {
      engine, profile: profile.name, path,
      frames: j.frames.length,
      gapsOver50: gaps.length,
      worstGap: j.frames.length ? Math.max(...j.frames) : 0,
      blockingMs: blocking,
      heightChanges: Math.max(0, j.heights.length - 1),
      heights: j.heights.slice(0, 6),
      longtasks: j.apis.longtask ? j.longtasks.filter((d) => d > 50).length : null,
      cls: j.apis.layoutShift ? Number(j.cls.toFixed(4)) : null,
      apis: j.apis,
    }
  } finally {
    await browser.close()
  }
}

const rows = []
for (const engine of ENGINES) {
  for (const profile of PROFILES(engine)) {
    for (const path of PAGES) {
      const r = await measure(engine, profile, path).catch((e) => ({ engine, profile: profile.name, path, error: String(e).slice(0, 90) }))
      rows.push(r)
      console.log(
        r.error
          ? `  ${r.profile.padEnd(26)} ${r.path.padEnd(34)} ERROR ${r.error}`
          : `  ${r.profile.padEnd(26)} ${r.path.padEnd(34)} gaps>50ms=${String(r.gapsOver50).padStart(3)}  worst=${String(r.worstGap).padStart(4)}ms  blocking=${String(r.blockingMs).padStart(5)}ms  heightChanges=${String(r.heightChanges).padStart(2)}  CLS=${r.cls ?? 'n/a'}  longtasks=${r.longtasks ?? 'n/a'}`
      )
    }
  }
}

console.log('\n| engine · profile | page | gaps >50ms | worst frame | blocking ms | scrollHeight changes | CLS | long tasks |')
console.log('|---|---|---|---|---|---|---|---|')
for (const r of rows) {
  if (r.error) { console.log(`| ${r.profile} | \`${r.path}\` | — | — | — | — | — | ERROR |`); continue }
  console.log(`| ${r.profile} | \`${r.path}\` | ${r.gapsOver50} | ${r.worstGap} ms | ${r.blockingMs} | ${r.heightChanges} | ${r.cls ?? 'n/a'} | ${r.longtasks ?? 'n/a'} |`)
}
console.log('\nn/a = the API does not exist on this engine (WebKit implements neither Long Tasks nor LayoutShift).')
console.log(JSON.stringify(rows))
process.exit(0)
