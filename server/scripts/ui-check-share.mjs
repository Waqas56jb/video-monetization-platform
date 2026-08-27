/**
 * Share sheet + WhatsApp Open Graph document.
 *
 *   node scripts/ui-check-share.mjs http://localhost:5173
 *   node scripts/ui-check-share.mjs https://video-monetization-platform-chi.vercel.app
 */
import { chromium } from 'playwright'

const BASE = (process.argv[2] || 'http://localhost:5173').replace(/\/$/, '')
const SLUG = process.argv[3] || 'studio-session-track-4'
const WATCH = `${BASE}/watch/${SLUG}`

const fail = []
const ok = []

function check(name, cond, detail = '') {
  if (cond) ok.push(name)
  else fail.push(detail ? `${name} (${detail})` : name)
}

async function run() {
  const ua = 'WhatsApp/2.24.15.78 N'
  const canServeOg = !/localhost|127\.0\.0\.1/.test(BASE)

  if (canServeOg) {
    const crawler = await fetch(WATCH, { headers: { 'user-agent': ua } })
    const html = await crawler.text()
    check('WhatsApp crawler HTTP 200', crawler.status === 200, `status=${crawler.status}`)
    check('crawler document is small', html.length < 8000, `bytes=${html.length}`)
    check('og:type is website (not video.other)', /og:type" content="website"/.test(html))
    check('no video.other type', !/video\.other/.test(html))
    check('og:title present', /property="og:title"/.test(html))
    check(
      'og:image JPEG card',
      /property="og:image"[^>]+content="[^"]+/.test(html) || /og:image" content="[^"]+/.test(html)
    )
    check('og:url is the watch page', html.includes(`/watch/${SLUG}`))
    check('does not advertise an in-chat mp4', !/\.mp4/.test(html))

    const imageMatch =
      html.match(/property="og:image"[^>]*content="([^"]+)"/) ||
      html.match(/content="([^"]+)"[^>]*property="og:image"/)
    const imageUrl = imageMatch?.[1]
    if (imageUrl) {
      const img = await fetch(imageUrl)
      const type = img.headers.get('content-type') || ''
      const buf = await img.arrayBuffer()
      const bytes = buf.byteLength
      check('og:image HTTP 200', img.status === 200, `status=${img.status}`)
      check('og:image is JPEG', /image\/jpeg/i.test(type), type)
      check('og:image has a real poster', bytes > 8000, `bytes=${bytes}`)
    } else {
      fail.push('og:image URL missing from crawler HTML')
    }
  } else {
    ok.push('OG HTML skipped on Vite (serverless /watch handler is production-only)')
  }

  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  page.setDefaultTimeout(25000)
  await page.goto(WATCH, { waitUntil: 'domcontentloaded' })
  const shareBtn = page.locator('button:has-text("Share"), button[aria-label*="Share" i]').first()
  await shareBtn.waitFor({ timeout: 20000 })
  await shareBtn.click()
  await page.waitForSelector('.share-modal .share-card', { timeout: 15000 })
  const sheet = await page.locator('.share-modal .share-card').innerText()
  check('share sheet opened', /Share this video|WhatsApp/i.test(sheet))
  check('WhatsApp is a primary action', /Share on WhatsApp/i.test(sheet))
  check('honest poster-card copy', /poster card|preview card/i.test(sheet))
  check('does not promise in-chat video file', !/watch the video in WhatsApp|sends the video file/i.test(sheet))
  const wa = page.locator('button.share-wa')
  check('WhatsApp button exists', (await wa.count()) > 0)
  await browser.close()

  console.log(`UI  ${WATCH}`)
  for (const n of ok) console.log(`OK   ${n}`)
  for (const n of fail) console.log(`FAIL ${n}`)
  console.log(`${ok.length} passed, ${fail.length} failed`)
  if (fail.length) process.exit(1)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
