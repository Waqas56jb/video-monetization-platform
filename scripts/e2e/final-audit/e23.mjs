const pw = await import(process.env.PLAYWRIGHT_MODULE)
const { BASE } = process.env
const b = await pw.chromium.launch()
const ERR = /Could not load|No connection|Too many requests|Something went wrong/i
async function load(url, ready) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const page = await ctx.newPage()
  const failed = [], statuses = []
  page.on('requestfailed', (r) => { if (/\/api\/|videodelivery|cloudflarestream/.test(r.url()) && !/abort/i.test(r.failure()?.errorText || '')) failed.push(`${r.failure()?.errorText} ${r.url().slice(0, 80)}`) })
  page.on('response', (r) => { if (/\/api\//.test(r.url()) && r.status() >= 400) statuses.push(`${r.status()} ${r.url().replace(/^https:\/\/[^/]+/, '').slice(0, 60)}`) })
  const t0 = Date.now()
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 })
  const ok = await page.waitForFunction(ready, null, { timeout: 30000 }).then(() => true).catch(() => false)
  const ms = Date.now() - t0
  await page.waitForTimeout(1500)
  const err = (await page.evaluate(() => document.body.innerText)).match(ERR)?.[0] || null
  await ctx.close()
  return { ok, ms, err, failed, statuses }
}
for (const [label, url, ready, n] of [
  ['Home + Trending', `${BASE}/`, () => document.querySelectorAll('a[href*="/watch/"]').length >= 4 && /Trending/i.test(document.body.innerText), 20],
  ['Trending (explore sort)', `${BASE}/explore?sort=trending`, () => document.querySelectorAll('a[href*="/watch/"]').length >= 4, 5],
  ['Watch: Nyerere Day (the video reported with ERR_FAILED / 429)', `${BASE}/watch/nyerere-day-rehearsals-awaiting-review`, () => !!document.querySelector('.stream-shell iframe, .stream-frame'), 10],
  ['Watch: Ugali & Samaki (free+ads)', `${BASE}/watch/ugali-samaki-sunday-cooking`, () => !!document.querySelector('.stream-shell iframe, .stream-frame'), 10],
]) {
  const rs = []
  for (let i = 0; i < n; i++) rs.push(await load(url, ready))
  const good = rs.filter((r) => r.ok && !r.err && !r.failed.length && !r.statuses.length).length
  const ms = rs.map((r) => r.ms).sort((a, b) => a - b)
  console.log(`${label}: ${good}/${n} clean loads · ready median ${ms[Math.floor(n / 2)]} ms, max ${ms.at(-1)} ms`)
  for (const [i, r] of rs.entries()) if (!(r.ok && !r.err && !r.failed.length && !r.statuses.length)) console.log(`   load ${i + 1}: ready=${r.ok} err=${r.err} failed=${JSON.stringify(r.failed)} http=${JSON.stringify(r.statuses)}`)
}
await b.close()
