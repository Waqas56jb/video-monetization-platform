const pw = await import(process.env.PLAYWRIGHT_MODULE)
const { chromium, devices } = pw
const b = await chromium.launch(); const out = []
for (let i = 0; i < 5; i++) {
  const ctx = await b.newContext({ ...devices['Pixel 7'] }); const page = await ctx.newPage()
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }); await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 })
  const t0 = Date.now()
  await page.goto(`${process.env.BASE}/`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForFunction(() => document.querySelectorAll('a[href*="/watch/"]').length >= 4, null, { timeout: 60000 })
  const cards = Date.now() - t0
  await page.waitForFunction(() => [...document.querySelectorAll('img')].some((i) => i.complete && i.naturalWidth > 0 && /videodelivery|og\/card|thumbnail|playback/.test(i.currentSrc) && i.getBoundingClientRect().top < innerHeight * 2), null, { timeout: 60000 }).catch(() => {})
  const pic = Date.now() - t0
  out.push([cards, pic]); console.log(`run ${i + 1}: 4 real video cards in the DOM ${cards} ms · first video thumbnail decoded ${pic} ms`)
  await ctx.close()
}
const m = (k) => out.map((r) => r[k]).sort((a, b) => a - b)[2]
console.log(`MEDIAN: cards ${m(0)} ms · first thumbnail ${m(1)} ms`)
await b.close()
