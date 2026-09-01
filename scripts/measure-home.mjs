/**
 * E1, second half — how long Home takes to show its first card.
 *
 * The gate was identified by watching a MutationObserver on the first
 * `/watch/` link against resource timing: in every sample the last thing to
 * finish before the card appears is `/api/videos`, by milliseconds. So this
 * times exactly that — navigation start to the first card in the DOM — rather
 * than a paint event, which on this page fires long before there is anything
 * worth looking at.
 *
 * COLD AND WARM ARE DIFFERENT MEASUREMENTS and are reported separately. Cold is
 * a brand-new context: no cache, no service worker, no connection to reuse.
 * Warm is a second visit in the same context. Mixing them produces a number
 * that describes nobody.
 *
 * Median of five with one warm-up discarded, because a single figure from this
 * site is close to meaningless — see the caveat in PLAYER-MEASURE.md's Floor
 * section.
 *
 *   PLAYWRIGHT_MODULE=file:///… node scripts/measure-home.mjs
 *   RUNS=5 PROFILES=desktop node scripts/measure-home.mjs
 */
const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const { devices } = pw

const BASE = process.env.BASE || 'https://video-monetization-platform-chi.vercel.app'
const RUNS = Number(process.env.RUNS || 5)

const PROFILES = [
  { name: 'desktop', engine: 'chromium', opts: { viewport: { width: 1440, height: 900 } } },
  { name: 'iPhone 13', engine: 'chromium', opts: { ...devices['iPhone 13'] } },
]
const only = process.env.PROFILES ? process.env.PROFILES.split(',').map((s) => s.trim()) : null

/* Installed before any page script runs, so a card that appears during boot is
   not missed by an observer attached afterwards. */
const PROBE = `
  window.__firstCard = null
  const done = () => {
    if (window.__firstCard) return
    if (document.querySelector('a[href*="/watch/"]')) {
      window.__firstCard = performance.now()
      obs.disconnect()
    }
  }
  const obs = new MutationObserver(done)
  document.addEventListener('DOMContentLoaded', () => {
    obs.observe(document.documentElement, { childList: true, subtree: true })
    done()
  })
`

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2)
}

async function timeFirstCard(ctx) {
  const page = await ctx.newPage()
  await page.addInitScript(PROBE)
  await page.goto(`${BASE}/`, { waitUntil: 'commit', timeout: 120000 })
  await page.waitForFunction(() => window.__firstCard !== null, { timeout: 90000 }).catch(() => {})
  const ms = await page.evaluate(() => (window.__firstCard == null ? null : Math.round(window.__firstCard)))
  const cards = await page.locator('a[href*="/watch/"]').count()
  await page.close()
  return { ms, cards }
}

console.log(`\nHome → first card · ${BASE} · median of ${RUNS}, one warm-up discarded\n`)
const table = []

for (const profile of PROFILES) {
  if (only && !only.includes(profile.name)) continue
  const browser = await pw[profile.engine].launch()

  for (const state of ['cold', 'warm']) {
    const samples = []
    let cards = 0
    for (let run = 0; run <= RUNS; run++) {
      const ctx = await browser.newContext({ ...profile.opts })
      if (state === 'warm') {
        // One visit to fill the cache and the service worker, then measure the second.
        const first = await ctx.newPage()
        await first.goto(`${BASE}/`, { waitUntil: 'load', timeout: 120000 }).catch(() => {})
        await first.waitForTimeout(3000)
        await first.close()
      }
      const r = await timeFirstCard(ctx)
      await ctx.close()
      if (run === 0) continue // warm-up discarded
      if (r.ms != null) samples.push(r.ms)
      cards = Math.max(cards, r.cards)
    }
    const m = samples.length ? median(samples) : null
    table.push({ profile: profile.name, state, median: m, min: Math.min(...samples), max: Math.max(...samples), n: samples.length, cards })
    console.log(
      `  ${profile.name.padEnd(11)} ${state.padEnd(5)} median ${String(m).padStart(5)} ms  ` +
      `[${Math.min(...samples)}–${Math.max(...samples)}]  n=${samples.length}  cards=${cards}`
    )
  }
  await browser.close()
}

/* The figures E1 must not regress against, from M2-VERIFY.md's Step 0. */
const BASELINE = {
  'desktop cold': 2336,
  'desktop warm': 1047,
  'iPhone 13 cold': 2502,
  'iPhone 13 warm': 898,
}

console.log('\n### against the recorded baseline')
let regressed = 0
for (const row of table) {
  const key = `${row.profile} ${row.state}`
  const was = BASELINE[key]
  if (was == null || row.median == null) continue
  /* A 25 % allowance. These are network measurements from a single location
     against a CDN whose cache state we do not control, and the same page has
     been seen to vary by more than that between runs minutes apart — a tighter
     bar would report the weather as a regression. */
  const bar = Math.round(was * 1.25)
  const bad = row.median > bar
  if (bad) regressed += 1
  console.log(
    `  ${key.padEnd(17)} ${String(row.median).padStart(5)} ms vs ${String(was).padStart(5)} ms  ` +
    `(bar ${bar})  ${bad ? 'REGRESSION' : 'ok'}`
  )
}
console.log(regressed ? `\n${regressed} REGRESSION(S)` : '\nNo regression.')
process.exit(regressed ? 1 : 0)
