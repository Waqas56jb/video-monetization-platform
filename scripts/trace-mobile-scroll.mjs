/**
 * Why does the main thread re-style and re-layout while a phone scrolls?
 *
 * A DevTools timeline trace (invalidation tracking + animation events) of a
 * scripted scroll on a Pixel 7 profile with the CPU throttled 4x, against
 * production. It tallies WHAT invalidated style and layout and WHY, in
 * Chromium's own words — which is how the 2026-09-17 freeze was pinned on
 * infinite keyframe animations (play-button pulse, ticker, skeleton shimmer)
 * and a scrollY read, rather than on any of the things it was assumed to be.
 *
 *   PLAYWRIGHT_MODULE=file:///… node scripts/trace-mobile-scroll.mjs
 *   PAGE=/explore CPU=6 node scripts/trace-mobile-scroll.mjs
 *
 * Pair it with scripts/measure-mobile-jank.mjs, which says how bad; this
 * says what.
 */
const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const { chromium, devices } = pw
const BASE = process.env.BASE || 'https://video-monetization-platform-chi.vercel.app'
const CPU = Number(process.env.CPU || 4)
const PATH = process.env.PAGE || '/'
const browser = await chromium.launch()
const ctx = await browser.newContext({ ...devices['Pixel 7'] })
const page = await ctx.newPage()
const cdp = await ctx.newCDPSession(page)
await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU })
await page.goto(`${BASE}${PATH}`, { waitUntil: 'load', timeout: 90000 })
await page.waitForTimeout(2500)
const events = []
cdp.on('Tracing.dataCollected', (d) => events.push(...d.value))
const done = new Promise((r) => cdp.once('Tracing.tracingComplete', r))
await cdp.send('Tracing.start', {
  categories: 'devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.invalidationTracking,disabled-by-default-devtools.timeline.stack,blink.animations,devtools.timeline.async',
  transferMode: 'ReportEvents',
})
await page.evaluate(async () => {
  const max = Math.max(0, document.documentElement.scrollHeight - innerHeight)
  for (let y = 0; y <= max; y += Math.max(60, innerHeight / 6)) {
    window.scrollTo(0, y)
    await new Promise((r) => setTimeout(r, 70))
  }
  await new Promise((r) => setTimeout(r, 400))
})
await cdp.send('Tracing.end')
await done
await browser.close()

const tally = (label, pick) => {
  const m = new Map()
  for (const e of events) {
    const k = pick(e)
    if (k) m.set(k, (m.get(k) || 0) + 1)
  }
  console.log(`\n== ${label} ==`)
  for (const [k, v] of [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 16)) console.log(`  ${String(v).padStart(5)}×  ${k}`)
}
const d = (e) => e.args?.data || {}
tally('ScheduleStyleInvalidationTracking (what changed)', (e) =>
  e.name === 'ScheduleStyleInvalidationTracking' ? `${d(e).nodeName || '?'} — ${d(e).changedClass ? `class .${d(e).changedClass}` : d(e).changedAttribute ? `attr ${d(e).changedAttribute}` : d(e).changedId ? `id #${d(e).changedId}` : d(e).changedPseudo ? `pseudo ${d(e).changedPseudo}` : d(e).invalidationSet || d(e).reason || JSON.stringify(d(e)).slice(0, 80)}` : null
)
tally('StyleRecalcInvalidationTracking (why recalc)', (e) => (e.name === 'StyleRecalcInvalidationTracking' ? `${d(e).nodeName || '?'} — ${d(e).reason}${d(e).extraData ? ` ${d(e).extraData}` : ''}` : null))
tally('StyleInvalidatorInvalidationTracking', (e) => (e.name === 'StyleInvalidatorInvalidationTracking' ? `${d(e).nodeName || '?'} — ${d(e).reason} ${(d(e).selectorParts || []).join(',')}` : null))
tally('LayoutInvalidationTracking (why layout)', (e) => (e.name === 'LayoutInvalidationTracking' ? `${d(e).nodeName || '?'} — ${d(e).reason}` : null))
tally('Animation events (property · state · compositeFailed/unsupported)', (e) =>
  e.name === 'Animation' && (e.ph === 'b' || e.ph === 'n' || e.ph === 'e') ? `${d(e).name || d(e).displayName || '?'} · ${d(e).state || e.ph} · ${d(e).compositeFailed ? `NOT composited: ${d(e).compositeFailed}` : 'composited?'} ${(d(e).unsupportedProperties || []).join(',')} · ${d(e).nodeName || ''}` : null
)
tally('ScheduleStyleRecalculation callers', (e) => {
  if (e.name !== 'ScheduleStyleRecalculation') return null
  const s = d(e).stackTrace?.[0]
  return s ? `${s.functionName || '(anon)'} ${(s.url || '').split('/').pop()}:${s.lineNumber}:${s.columnNumber}` : '(no stack)'
})
tally('InvalidateLayout callers', (e) => {
  if (e.name !== 'InvalidateLayout') return null
  const s = d(e).stackTrace?.[0]
  return s ? `${s.functionName || '(anon)'} ${(s.url || '').split('/').pop()}:${s.lineNumber}:${s.columnNumber}` : '(no stack)'
})
tally('all event names (top)', (e) => e.name)
