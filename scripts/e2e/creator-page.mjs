/**
 * C2 — the creator page: a link to the creator from every card, and Watch +
 * Share on every release.
 *
 * The share assertion uses `waitFor`, not `isVisible`. `isVisible()` reports the
 * CURRENT state and does not wait, and this sheet only appears after a round
 * trip for its share payload — so the first version of this check reported
 * "Share does not open" on all three engines for a sheet that opens fine.
 *
 * It also checks that the sheet is the REAL one, by looking for WhatsApp in it.
 * A creator page that quietly grew its own cut-down share dialog would be a
 * second implementation to keep in step with the watch page, and the WhatsApp
 * path in particular is the one the client reported and the one that took work.
 */
const pw = await import(process.env.PLAYWRIGHT_MODULE)
const { devices } = pw
const BASE = 'https://video-monetization-platform-chi.vercel.app'
const API = 'https://video-monetization-platform-production.up.railway.app'
const ok = (c, m) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${m}`); return Boolean(c) }
const fails = []
const check = (c, m) => { if (!ok(c, m)) fails.push(m); return Boolean(c) }

const list = await (await fetch(`${API}/api/videos?limit=8&sort=trending`)).json()
const creatorId = list.videos.find((v) => v.creator?.id)?.creator.id
console.log(`\ncreator page under test: /creator/${creatorId}`)

for (const [name, engine, opts] of [
  ['webkit desktop', 'webkit', { viewport: { width: 1440, height: 900 } }],
  ['iPhone 14 · webkit', 'webkit', { ...devices['iPhone 14'] }],
  ['chromium desktop', 'chromium', { viewport: { width: 1440, height: 900 } }],
]) {
  console.log(`\n### ${name}`)
  const b = await pw[engine].launch()
  const page = await (await b.newContext(opts)).newPage()
  await page.goto(`${BASE}/creator/${creatorId}`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForTimeout(7000)

  const releases = await page.locator('.release').count()
  const watch = await page.locator('.release-actions a', { hasText: /watch/i }).count()
  const share = await page.locator('.release-actions button', { hasText: /share/i }).count()
  check(releases > 0, `the page lists releases (${releases})`)
  check(watch === releases + (await page.locator('.creator-featured').count()), `every release has a Watch button (${watch})`)
  check(share === watch, `every release has a Share button (${share})`)

  // no horizontal overflow from the new row
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  check(overflow <= 0, `no horizontal overflow (scrollWidth - innerWidth = ${overflow})`)

  // Watch goes to the video
  const before = page.url()
  await page.locator('.release-actions a', { hasText: /watch/i }).first().click()
  await page.waitForTimeout(2500)
  check(/\/watch\//.test(page.url()), `Watch opens the video (${new URL(page.url()).pathname})`)

  // Share opens the same sheet the watch page uses
  await page.goto(`${BASE}/creator/${creatorId}`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForTimeout(7000)
  await page.locator('.release-actions button', { hasText: /share/i }).first().click()
  // waitFor, not isVisible: isVisible() reports the CURRENT state and does not
  // wait, and this sheet only appears after a round trip for its share payload.
  const sheet = await page.locator('.share-modal').first()
    .waitFor({ state: 'visible', timeout: 25000 }).then(() => true).catch(() => false)
  check(sheet, 'Share opens the share sheet')
  if (sheet) {
    const text = (await page.locator('.share-modal').first().innerText()).replace(/\s+/g, ' ').slice(0, 130)
    console.log(`        sheet says: ${text}`)
    const wa = await page.locator('.share-modal').locator('text=/whatsapp/i').count()
    check(wa > 0, 'and it is the real sheet — WhatsApp is in it, not a cut-down copy')
  }
  await b.close()
}
console.log(fails.length ? `\n${fails.length} FAILURE(S):\n  - ${fails.join('\n  - ')}` : '\nALL PASS')
process.exit(fails.length ? 1 : 0)
