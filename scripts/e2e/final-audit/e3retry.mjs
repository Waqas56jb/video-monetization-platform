const pw = await import(process.env.PLAYWRIGHT_MODULE)
const b = await pw.chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
let hits = 0
await page.route('**/api/videos?**', async (r) => { hits++; if (hits === 1) return r.abort('connectionreset'); return r.continue() })
const errSeen = []
await page.goto(`${process.env.BASE}/`, { waitUntil: 'domcontentloaded' })
const t0 = Date.now()
while (Date.now() - t0 < 12000) { const t = await page.evaluate(() => document.body.innerText); if (/No connection|Could not load/i.test(t)) errSeen.push(Date.now() - t0); if (await page.locator('a[href*="/watch/"]').count() >= 4) break; await page.waitForTimeout(150) }
console.log(`first /api/videos request killed; requests made: ${hits}; cards on screen: ${await page.locator('a[href*="/watch/"]').count()}; error text ever shown: ${errSeen.length ? 'YES' : 'no'}`)
await b.close()
