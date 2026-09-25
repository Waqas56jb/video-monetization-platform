const pw = await import(process.env.PLAYWRIGHT_MODULE)
for (const engine of ['chromium', 'webkit']) {
  const b = await pw[engine].launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' }); const page = await ctx.newPage()
  let first = true, loads = 0; page.on('load', () => loads++)
  await page.route('**/assets/index-*.js', (r) => { if (first) { first = false; return r.fulfill({ status: 404, contentType: 'text/plain', body: 'Not Found' }) } return r.continue() })
  await page.goto(`${process.env.BASE}/explore`, { waitUntil: 'domcontentloaded' })
  const ok = await page.waitForSelector('a[href*="/watch/"]', { timeout: 30000 }).then(() => true).catch(() => false)
  console.log(`${engine}: entry script answered 404 on the first load → page loads ${loads}, app rendered=${ok}`)
  await b.close()
}
