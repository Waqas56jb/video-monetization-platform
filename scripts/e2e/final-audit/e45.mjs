// E4 cold Home load on a throttled phone (median of 5) · E5 scroll + navigation: long tasks and layout shift.
const pw = await import(process.env.PLAYWRIGHT_MODULE)
const { chromium, devices } = pw
const { BASE, API } = process.env
const b = await chromium.launch()
async function phone() {
  const ctx = await b.newContext({ ...devices['Pixel 7'] }); const page = await ctx.newPage()
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 })
  await page.addInitScript(() => {
    window.__lt = []; window.__cls = 0; window.__lcp = 0
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(Math.round(e.duration)) }).observe({ type: 'longtask', buffered: true })
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value }).observe({ type: 'layout-shift', buffered: true })
    new PerformanceObserver((l) => { const e = l.getEntries().at(-1); if (e) window.__lcp = Math.round(e.startTime) }).observe({ type: 'largest-contentful-paint', buffered: true })
  })
  return { ctx, page }
}
const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]

console.log('### E4 cold Home, Pixel 7, CPU x4, 150ms / 1.6 Mbps')
const rows = []
for (let i = 0; i < 5; i++) {
  const { ctx, page } = await phone()
  const t0 = Date.now()
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  const dcl = Date.now() - t0
  await page.waitForFunction(() => document.querySelectorAll('a[href*="/watch/"] img').length >= 1 && [...document.querySelectorAll('a[href*="/watch/"] img')].some((i) => i.complete && i.naturalWidth > 0), null, { timeout: 60000 }).catch(() => {})
  const cards = Date.now() - t0
  await page.waitForTimeout(1500)
  const lcp = await page.evaluate(() => window.__lcp)
  const chunks = await page.evaluate(() => performance.getEntriesByType('resource').filter((r) => /\/assets\/.*\.js$/.test(r.name)).map((r) => r.name.split('/').pop()))
  rows.push({ dcl, cards, lcp, chunks })
  console.log(`  run ${i + 1}: DOMContentLoaded ${dcl} ms · first card with its picture ${cards} ms · LCP ${lcp} ms · JS chunks: ${chunks.join(', ')}`)
  await ctx.close()
}
console.log(`  MEDIAN: DOMContentLoaded ${med(rows.map((r) => r.dcl))} ms · first card ${med(rows.map((r) => r.cards))} ms · LCP ${med(rows.map((r) => r.lcp))} ms`)

console.log('\n### E5 scroll + navigate on the same phone profile')
const s = (await (await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: process.env.E2E_EMAIL, password: process.env.E2E_PASSWORD, side: 'viewer' }) })).json()).session
const { ctx, page } = await phone()
await page.goto(`${BASE}/login`); await page.evaluate((s) => { localStorage.setItem('mtonyo.access', s.accessToken); localStorage.setItem('mtonyo.refresh', s.refreshToken) }, s)
for (const [label, url] of [['Home', '/'], ['Explore', '/explore'], ['Watch', '/watch/live-at-arusha-full-set'], ['Dashboard library', '/dashboard?tab=library']]) {
  await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForTimeout(4000)
  await page.evaluate(() => { window.__lt = []; window.__cls = 0 })
  for (let i = 0; i < 10; i++) { await page.mouse.wheel(0, 500); await page.waitForTimeout(250) }
  for (let i = 0; i < 10; i++) { await page.mouse.wheel(0, -500); await page.waitForTimeout(250) }
  await page.waitForTimeout(800)
  const r = await page.evaluate(() => ({ lt: window.__lt, cls: window.__cls, overflow: document.documentElement.scrollWidth > innerWidth + 1 }))
  console.log(`  ${label.padEnd(18)} while scrolling: long tasks ${r.lt.length} (${r.lt.filter((x) => x > 100).length} over 100 ms, longest ${Math.max(0, ...r.lt)} ms) · layout shift ${r.cls.toFixed(4)} · sideways overflow ${r.overflow}`)
}
await ctx.close()
await b.close()
