/* Count every /api/* request a real session fires, page by page, against production. */
const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const { chromium } = pw
const BASE = process.env.BASE || 'https://video-monetization-platform-chi.vercel.app'
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
const all = []
let current = 'boot'
page.on('response', (r) => {
  const u = r.url()
  if (!/\/api\//.test(u) || /cloudflarestream|videodelivery/.test(u)) return
  const h = r.headers()
  all.push({ page: current, method: r.request().method(), path: u.replace(/^https?:\/\/[^/]+/, '').replace(/\?.*$/, '').replace(/[0-9a-f-]{36}/g, ':id'), status: r.status(), remaining: h['ratelimit'] || '' })
})
const t0 = Date.now()
const step = async (name, fn, settle = 6000) => {
  current = name
  const before = all.length
  await fn()
  await page.waitForTimeout(settle)
  const mine = all.slice(before)
  const dup = new Map()
  for (const r of mine) { const k = `${r.method} ${r.path}`; dup.set(k, (dup.get(k) || 0) + 1) }
  const c429 = mine.filter((r) => r.status === 429).length
  const last = mine.length ? mine[mine.length - 1].remaining : ''
  console.log(`\n## ${name}  (+${Math.round((Date.now() - t0) / 1000)}s)  ${mine.length} requests, ${c429} × 429, bucket after: ${last || '?'}`)
  for (const [k, n] of [...dup.entries()].sort((a, b) => b[1] - a[1])) console.log(`   ${String(n).padStart(2)}×  ${k}`)
}
await step('Home', () => page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 90000 }), 8000)
await step('Home scroll to Trending + hover 3 cards', async () => {
  await page.evaluate(() => document.getElementById('trending')?.scrollIntoView())
  await page.waitForTimeout(1500)
  const cards = page.locator('.vid-card')
  const n = Math.min(3, await cards.count())
  for (let i = 0; i < n; i++) { await cards.nth(i).hover().catch(() => {}); await page.waitForTimeout(700) }
})
await step('Explore', () => page.goto(`${BASE}/explore`, { waitUntil: 'domcontentloaded', timeout: 90000 }))
await step('Explore: filter chip + clear', async () => {
  const chips = page.locator('.chip[aria-pressed]')
  if ((await chips.count()) > 1) { await chips.nth(1).click(); await page.waitForTimeout(2500); await chips.nth(0).click() }
})
await step('Watch: paid preview (Arusha)', () => page.goto(`${BASE}/watch/live-at-arusha-full-set`, { waitUntil: 'domcontentloaded', timeout: 90000 }), 15000)
await step('Back to Home (history)', () => page.goBack({ waitUntil: 'domcontentloaded' }))
await step('Watch: Free+Ads (ugali) — sit 40s through the ad', () => page.goto(`${BASE}/watch/ugali-samaki-sunday-cooking`, { waitUntil: 'domcontentloaded', timeout: 90000 }), 40000)
await step('Watch: another (fishermen)', () => page.goto(`${BASE}/watch/the-fishermen-of-kilwa`, { waitUntil: 'domcontentloaded', timeout: 90000 }), 12000)
await step('Login page', () => page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 90000 }))
const total = all.length
const mins = (Date.now() - t0) / 60000
console.log(`\n=== TOTAL: ${total} API requests in ${mins.toFixed(1)} min = ${(total / mins).toFixed(1)} req/min · 429s: ${all.filter((r) => r.status === 429).length}`)
const agg = new Map()
for (const r of all) { const k = `${r.method} ${r.path}`; agg.set(k, (agg.get(k) || 0) + 1) }
console.log('=== by endpoint, whole session ===')
for (const [k, n] of [...agg.entries()].sort((a, b) => b[1] - a[1])) console.log(`   ${String(n).padStart(3)}×  ${k}`)
await browser.close()
