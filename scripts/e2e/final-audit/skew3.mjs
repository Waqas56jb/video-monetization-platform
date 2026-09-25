const pw = await import(process.env.PLAYWRIGHT_MODULE)
const { BASE } = process.env
for (const [label, path, act] of [['opened on Explore, then a card is tapped', '/explore', true], ['a shared link opened straight onto a watch page', '/watch/live-at-arusha-full-set', false]]) {
  const b = await pw.chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' }); const page = await ctx.newPage()
  let first = true, loads = 0
  page.on('load', () => loads++)
  await page.route('**/assets/Watch-*.js', (r) => { if (first) { first = false; return r.fulfill({ status: 404, contentType: 'text/plain', body: 'Not Found' }) } return r.continue() })
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(6000)
  if (act) await page.locator('a[href$="/watch/live-at-arusha-full-set"]').first().click()
  const ok = await page.waitForSelector('.stream-shell, .unlock-bar', { timeout: 30000 }).then(() => true).catch(() => false)
  console.log(`${label}: first Watch chunk request answered 404 → full page loads ${loads}, watch page rendered=${ok}, error screen=${(await page.locator('text=/crashed|Something went wrong/i').count()) > 0}`)
  await b.close()
}
