import { chromium } from 'playwright'

const BASE = (process.argv[2] || 'http://localhost:5173').replace(/\/$/, '')
const SLUG = process.argv[3] || 'live-at-arusha-full-set'

const b = await chromium.launch({
  channel: 'msedge',
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required'],
})
const page = await b.newPage({ viewport: { width: 1280, height: 900 } })
await page.goto(`${BASE}/watch/${SLUG}`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.player iframe.stream-frame, .player-empty, .lock-gate', { timeout: 25000 })
for (let i = 0; i < 4; i += 1) {
  const tap = page.locator('.player .stream-tap')
  if (await tap.count()) await tap.click({ force: true }).catch(() => {})
  const readyNow = await page.locator('.player .stream-shell.is-ready').count()
  if (readyNow) break
  await page.waitForTimeout(2000)
}
await page.waitForSelector('.player .stream-shell.is-ready', { timeout: 20000 }).catch(() => {})
const empty = await page.locator('.player-empty').count()
const iframe = await page.locator('.player iframe.stream-frame').count()
const ready = await page.locator('.player .stream-shell.is-ready').count()
const box = iframe ? await page.locator('.player .stream-shell').boundingBox() : null
console.log(JSON.stringify({
  url: page.url(),
  empty,
  iframe,
  ready,
  height: box?.height || 0,
  hasPreview: /preview|unlock|pay/i.test(await page.locator('body').innerText()),
}))
if (empty || !iframe || !ready || (box?.height || 0) < 120) process.exit(1)
await b.close()
