// Usage: (cd client && npx vite build && npx vite preview --port 4173) then
//   PLAYWRIGHT_MODULE=file:///…/playwright/index.mjs OUT=./shots E2E_EMAIL=<a viewer that does not own the slug> E2E_PASSWORD=… node scripts/e2e/m3-checkout-sponsors.mjs
// M3 browser E2E against the built client (vite preview on :4173), real production API for
// reads/login, payments + sponsors mocked at the network layer, and a fake AirPay checkout on :4600.
import http from 'node:http'
const pw = await import(process.env.PLAYWRIGHT_MODULE)
const { chromium, devices } = pw
const SITE = 'http://localhost:4173'
const API = 'https://video-monetization-platform-production.up.railway.app'
const OUT = process.env.OUT
const SLUG = 'fa14194e-a14a-45ee-ab4b-b4d3a36984ab' // Lisu, paid, 15 s preview — not owned by the probe
const PAY_ID = '11111111-2222-4333-8444-555555555555'
const fails = []
const check = (c, m) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fails.push(m) }

/* ---------------- fake AirPay hosted page ---------------- */
const airpaySeen = []
const gw = http.createServer((req, res) => {
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    airpaySeen.push({ method: req.method, url: req.url, type: req.headers['content-type'], fields: Object.fromEntries(new URLSearchParams(body)) })
    // AirPay → our API return route → 303 to the watch page (the API part is not deployed yet, so emulated here)
    res.writeHead(303, { Location: `${SITE}/watch/${SLUG}?payment=${PAY_ID}` })
    res.end()
  })
})
await new Promise((r) => gw.listen(4600, '127.0.0.1', r))

const SPONSORS = [
  { id: 'aaaaaaaa-0000-4000-8000-000000000001', sponsor: 'Vodacom Tanzania', title: 'Unlimited data weekends', tagline: 'Stream every MTONYO+ release without worrying about bundles', cta: 'Get the offer', imageUrl: `${SITE}/icons/icon-512.png`, clickPath: '/api/sponsors/aaaaaaaa-0000-4000-8000-000000000001/click' },
  { id: 'aaaaaaaa-0000-4000-8000-000000000002', sponsor: 'Azam Pay', title: 'Pay in one tap', tagline: null, cta: 'Learn more', imageUrl: null, clickPath: '/api/sponsors/aaaaaaaa-0000-4000-8000-000000000002/click' },
]

const browser = await chromium.launch()
/* Production CORS (rightly) refuses localhost. For this local run only, pass the
   real API through Playwright's own client and answer with CORS headers. */
const CORS = { 'access-control-allow-origin': SITE, 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'authorization, content-type, x-client-build', 'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS', 'access-control-expose-headers': 'X-Auth-Status,X-Build' }
async function passThrough(page) {
  await page.route(`${API}/**`, async (r) => {
    if (r.request().method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS })
    const headers = { ...r.request().headers(), origin: 'https://video-monetization-platform-chi.vercel.app' }
    const res = await r.fetch({ headers }).catch(() => null)
    if (!res) return r.abort('failed')
    r.fulfill({ response: res, headers: { ...res.headers(), ...CORS } })
  })
}

async function sponsorRun(label, ctxOpts, answer) {
  const ctx = await browser.newContext(ctxOpts)
  const page = await ctx.newPage()
  await passThrough(page)
  const impressions = []
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.route(`${API}/api/sponsors`, (r) => answer(r))
  await page.route(`${API}/api/sponsors/*/impression`, (r) => { impressions.push(r.request().url()); r.fulfill({ status: 204, headers: CORS }) })
  await page.goto(`${SITE}/`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  return { ctx, page, impressions, errors }
}

console.log('\n### A. homepage sponsors')
for (const [label, opts] of [['phone (Pixel 7)', devices['Pixel 7']], ['desktop 1280', { viewport: { width: 1280, height: 800 } }]]) {
  const { ctx, page, impressions, errors } = await sponsorRun(label, opts, (r) => r.fulfill({ headers: CORS, json: { sponsors: SPONSORS } }))
  const strip = page.locator('.sponsor-strip')
  check(await strip.isVisible(), `${label}: banner visible under the hero`)
  check(impressions.length === 0, `${label}: nothing counted while it is below the fold (${impressions.length})`)
  await strip.scrollIntoViewIfNeeded()
  await page.waitForTimeout(900)
  check((await strip.locator('.sponsor-label').textContent()).includes('Sponsored · Vodacom Tanzania'), `${label}: labelled Sponsored with the sponsor's name`)
  const a = strip.locator('a.sponsor-card')
  check((await a.getAttribute('href')) === `${API}/api/sponsors/${SPONSORS[0].id}/click`, `${label}: click goes through the counted API path`)
  check((await a.getAttribute('target')) === '_blank' && /sponsored/.test(await a.getAttribute('rel')), `${label}: opens a new tab, rel=sponsored noopener`)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  check(overflow <= 0, `${label}: no horizontal scroll (${overflow}px)`)
  check(impressions.length === 1, `${label}: one view counted when on screen (${impressions.length})`)
  await page.screenshot({ path: `${OUT}/sponsor-${label.split(' ')[0]}.png`, clip: { x: 0, y: 0, width: page.viewportSize().width, height: Math.min(900, (await strip.boundingBox()).y + 260) } })
  // rotation (desktop only — pausing on hover would otherwise interfere on touch)
  if (label.startsWith('desktop')) {
    await page.mouse.move(5, 5)
    await page.waitForTimeout(7600)
    check((await strip.locator('.sponsor-label').textContent()).includes('Azam Pay'), 'desktop: rotates to the second sponsor after 7 s')
    await page.waitForTimeout(800)
    check(impressions.length === 2, `desktop: the second sponsor's view is counted once (${impressions.length})`)
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForTimeout(1500)
    check(impressions.length === 2, `desktop: a reload in the same session counts nothing again (${impressions.length})`)
    await strip.locator('.sponsor-dots button').nth(1).click()
    check((await strip.locator('.sponsor-label').textContent()).includes('Azam Pay'), 'desktop: dots switch sponsor')
  }
  check(errors.length === 0, `${label}: no page errors (${errors.join(' | ').slice(0, 120)})`)
  await ctx.close()
}
for (const [label, answer] of [['no sponsors', (r) => r.fulfill({ headers: CORS, json: { sponsors: [] } })], ['API error 500', (r) => r.fulfill({ headers: CORS, status: 500, json: { error: { message: 'boom' } } })], ['network failure', (r) => r.abort('failed')]]) {
  const { ctx, page, errors } = await sponsorRun(label, { viewport: { width: 390, height: 844 } }, answer)
  check((await page.locator('.sponsor-strip').count()) === 0, `${label}: no banner, no gap`)
  check(await page.locator('.hero, header').first().isVisible(), `${label}: homepage still renders`)
  check(errors.length === 0, `${label}: no page errors`)
  await ctx.close()
}

console.log('\n### B. WhatsApp visit → AirPay hosted checkout → return → resume')
const ctx = await browser.newContext({ ...devices['Pixel 7'], userAgent: devices['Pixel 7'].userAgent })
const page = await ctx.newPage()
await passThrough(page)
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
let initiateBody = null
let polls = 0
let outcome = 'success'
await page.route(`${API}/api/stats`, async (r) => { const res = await r.fetch(); const j = await res.json(); r.fulfill({ headers: CORS, json: { ...j, paymentProvider: 'airpay' } }) })
await page.route(`${API}/api/payments/initiate`, (r) => {
  initiateBody = r.request().postDataJSON()
  r.fulfill({ headers: CORS, status: 201, json: { payment: { id: PAY_ID, orderId: 'MTN20261028ABCDEF12', status: 'pending', amountTzs: 10000 }, instructions: 'Continue on AirPay', redirect: { url: 'http://127.0.0.1:4600/pay/index.php', method: 'POST', fields: { orderid: 'MTN20261028ABCDEF12', amount: '10000.00', mercid: '247134', buyerPhone: '0712345678', buyerFirstName: 'Payment', privatekey: 'f'.repeat(64), checksum: 'e'.repeat(64), currency: '834', isocurrency: 'TZS', chmod: '' } } } })
})
await page.route(`${API}/api/payments/${PAY_ID}`, (r) => {
  polls++
  const settled = polls >= 2
  r.fulfill({ headers: CORS, json: { payment: { id: PAY_ID, status: settled ? outcome : 'pending', failureReason: outcome === 'failed' && settled ? 'Insufficient balance in the mobile money account' : null }, unlocked: settled && outcome === 'success', playbackUrl: null } })
})

// 1. arrive from a WhatsApp-tagged link (the share sheet's own links carry no tag; android-app referrers are covered by unit tests)
await page.goto(`${SITE}/?utm_source=wa&utm_campaign=launch-oct`, { waitUntil: 'domcontentloaded' })
const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('mtonyo.trafficSource') || 'null'))
check(stored?.source === 'whatsapp' && stored?.campaign === 'launch-oct', `visit recorded as WhatsApp / launch-oct (${JSON.stringify(stored)})`)

// 2. sign in as the probe viewer created by this session's sandbox run
await page.goto(`${SITE}/login`, { waitUntil: 'domcontentloaded' })
await page.fill('#login-id', process.env.E2E_EMAIL)
await page.fill('#login-pass', process.env.E2E_PASSWORD)
await page.click('button[type="submit"]')
const loggedIn = await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 25000 }).then(() => true).catch(() => false)
if (!loggedIn) { await page.screenshot({ path: `${OUT}/login-stuck.png` }); console.log('LOGIN PAGE TEXT:', (await page.locator('body').innerText()).slice(0, 600)); }
check(loggedIn, 'signed in')
const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('mtonyo.trafficSource') || 'null'))
check(kept?.source === 'whatsapp', `in-site navigation kept the source (${kept?.source})`)

// 3. the paid video, then Unlock now → pay
await page.goto(`${SITE}/watch/${SLUG}`, { waitUntil: 'domcontentloaded' })
await page.getByRole('button', { name: /Unlock now/i }).click({ timeout: 30000 })
await page.waitForSelector('#pay-phone', { timeout: 15000 })
await page.fill('#pay-phone', '0712345678')
await page.screenshot({ path: `${OUT}/pay-form.png` })
const nav = page.waitForURL((u) => u.searchParams.has('payment') || u.pathname.startsWith(`/watch/${SLUG}`) && polls > 0, { timeout: 30000 }).catch(() => null)
await page.locator('.pay-modal button[type="submit"], form button[type="submit"]').first().click()
await page.waitForURL(`${SITE}/watch/${SLUG}**`, { timeout: 30000 })
await nav
check(initiateBody?.source?.source === 'whatsapp' && initiateBody?.source?.campaign === 'launch-oct', `payment sent its traffic source (${JSON.stringify(initiateBody?.source)})`)
check(!('simulate' in (initiateBody || {})), 'no sandbox "simulate" sent when the provider is AirPay')
const hit = airpaySeen[0]
check(hit?.method === 'POST' && /x-www-form-urlencoded/.test(hit?.type || ''), `browser POSTed a real form to AirPay (${hit?.method} ${hit?.type})`)
check(hit?.fields?.orderid === 'MTN20261028ABCDEF12' && hit?.fields?.amount === '10000.00' && hit?.fields?.chmod === '', `every signed field arrived intact, empty ones included (${Object.keys(hit?.fields || {}).length} fields)`)

// 4. back on the watch page: the sheet picks the payment up, the ?payment= is gone, it confirms and hands off
await page.waitForSelector('text=Confirming your payment', { timeout: 20000 }).catch(() => null)
check(await page.locator('text=Confirming your payment').isVisible().catch(() => false), 'returned: "Confirming your payment…" (no phone-prompt wording)')
check(!new URL(page.url()).searchParams.has('payment'), `?payment= dropped from the address (${new URL(page.url()).search || 'none'})`)
await page.screenshot({ path: `${OUT}/pay-returned.png` })
const toast = await page.waitForSelector('text=/Unlocked —/', { timeout: 20000 }).catch(() => null)
check(Boolean(toast), `verified → hand-off to the player (${toast ? await toast.innerText() : 'no toast'})`)
check(polls >= 2, `the sheet polled the payment (${polls})`)

// 5. edge cases on return
outcome = 'failed'; polls = 0
await page.goto(`${SITE}/watch/${SLUG}?payment=${PAY_ID}`, { waitUntil: 'domcontentloaded' })
const failed = await page.waitForSelector('text=Insufficient balance', { timeout: 25000 }).catch(() => null)
check(Boolean(failed), 'returned with a failed payment → the failure reason, not a spinner')
await page.screenshot({ path: `${OUT}/pay-failed.png` })
await page.goto(`${SITE}/watch/${SLUG}?payment=not-a-payment-id`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(4000)
check(!(await page.locator('text=Confirming your payment').isVisible().catch(() => false)), 'junk ?payment= value is ignored — no sheet')
check(errors.length === 0, `no page errors (${errors.join(' | ').slice(0, 160)})`)

await browser.close()
gw.close()
console.log(fails.length ? `\n${fails.length} FAIL` : '\nALL PASS')
process.exit(fails.length ? 1 : 0)
