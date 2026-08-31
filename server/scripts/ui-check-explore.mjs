/**
 * Explore: unpublished titles stay off the grid; category is the upload field.
 *
 *   node scripts/ui-check-explore.mjs http://localhost:5173
 *   node scripts/ui-check-explore.mjs https://video-monetization-platform-chi.vercel.app
 */
import { chromium } from 'playwright'

const BASE = (process.argv[2] || 'http://localhost:5173').replace(/\/$/, '')
const API = (process.argv[3] || process.env.API_URL || 'https://video-monetization-platform-production.up.railway.app').replace(
  /\/$/,
  ''
)

const fail = []
const ok = []

function check(name, cond, detail = '') {
  if (cond) ok.push(name)
  else fail.push(detail ? `${name} (${detail})` : name)
}

const catalogue = await fetch(`${API}/api/videos?limit=50&sort=newest`).then((r) => r.json())
const titles = (catalogue.videos || []).map((v) => v.title)
check('public list has no Nyerere awaiting-review title', !titles.some((t) => /nyerere/i.test(t)))
check(
  'every public row claims published',
  (catalogue.videos || []).every((v) => v.isPublished !== false)
)

const nyerereSearch = await fetch(`${API}/api/videos?q=Nyerere&limit=20`).then((r) => r.json())
check('search does not return Nyerere', (nyerereSearch.total || 0) === 0)

const watch = await fetch(`${API}/api/videos/nyerere-day-rehearsals-awaiting-review`)
check('public watch of Nyerere is 404', watch.status === 404, `status=${watch.status}`)

const comedy = await fetch(`${API}/api/videos?category=Comedy`).then((r) => r.json())
check(
  'Comedy only returns Comedy',
  (comedy.videos || []).every((v) => v.category === 'Comedy') && (comedy.total || 0) === (comedy.videos || []).length
)

const music = await fetch(`${API}/api/videos?category=Music`).then((r) => r.json())
check('Music only returns Music', (music.videos || []).every((v) => v.category === 'Music'))
check('Music is not empty on this catalogue', (music.total || 0) > 0)

const sports = await fetch(`${API}/api/videos?category=Sports`).then((r) => r.json())
check('Sports with no uploads is zero', (sports.total || 0) === 0)

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
page.setDefaultTimeout(25000)
await page.goto(`${BASE}/explore`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('.vid-grid, .explore-empty, .state-error', { timeout: 20000 })
const body = await page.locator('body').innerText()
check('Explore loaded', /Explore/i.test(body))
check('Explore UI does not list Nyerere', !/Nyerere Day/i.test(body))

const comedyChip = page.locator('button.chip', { hasText: /^Comedy$/ }).first()
if (await comedyChip.count()) {
  await comedyChip.click()
  await page.waitForFunction(
    () => /0 videos|Nothing matches that yet/i.test(document.body.innerText),
    { timeout: 12000 }
  ).catch(() => {})
  const empty = await page.locator('.explore-empty').count()
  const countText = (await page.locator('.explore-count').innerText().catch(() => '')) || ''
  check('Comedy chip shows zero results', empty > 0 || /0 video/i.test(countText), countText.slice(0, 80))
}

await browser.close()

console.log(`UI  ${BASE}/explore`)
for (const n of ok) console.log(`OK   ${n}`)
for (const n of fail) console.log(`FAIL ${n}`)
console.log(`${ok.length} passed, ${fail.length} failed`)
if (fail.length) process.exit(1)
