import { chromium } from 'playwright'

const BASE = (process.argv[2] || 'http://localhost:5173').replace(/\/$/, '')
const SLUG = process.argv[3] || 'live-at-arusha-full-set'

const b = await chromium.launch({ channel: 'msedge', headless: true })
const page = await b.newPage({ viewport: { width: 1280, height: 900 } })
await page.goto(`${BASE}/watch/${SLUG}`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.player iframe.stream-frame, .player-empty, .lock-gate', { timeout: 25000 })
await page.waitForTimeout(2500)
const empty = await page.locator('.player-empty').count()
const iframe = await page.locator('.player iframe.stream-frame').count()
const box = iframe ? await page.locator('.player .stream-shell').boundingBox() : null
const crash = []
page.on('pageerror', (e) => crash.push(String(e)))
console.log(JSON.stringify({
  url: page.url(),
  empty,
  iframe,
  height: box?.height || 0,
  hasPreview: /preview|unlock|pay/i.test(await page.locator('body').innerText()),
  crash: crash.length,
}))
if (empty || !iframe || (box?.height || 0) < 120) process.exit(1)
await b.close()
