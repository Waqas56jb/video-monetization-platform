// Section L — the client's full journey, one continuous run per fresh account, production.
const pw = await import(process.env.PLAYWRIGHT_MODULE)
const { devices } = pw
const { BASE, API, ADMIN_WEB } = process.env
const PAID = 'live-at-arusha-full-set', FREE = 'ugali-samaki-sunday-cooking'
const fails = []
const check = (c, m) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fails.push(`${leg}: ${m}`); return c }
let leg = ''
const AUTOFILL = (sel, v) => `(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value'); d.set.call(el, ${JSON.stringify(v)}); el.dispatchEvent(new Event('input', { bubbles: true })); return true })()`
const api = async (method, path, token, body) => { const r = await fetch(`${API}${path}`, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }); return { status: r.status, body: await r.json().catch(() => ({})) } }
const tokenOf = async (email, password, side = 'viewer') => (await api('POST', '/api/auth/login', null, { email, password, side })).body.session?.accessToken
async function frameState(page) {
  for (const f of page.frames()) {
    if (!/videodelivery|cloudflarestream/.test(f.url())) continue
    const inAd = await f.frameElement().then((e) => e.evaluate((x) => !!x.closest('.ad-stage'))).catch(() => false)
    if (inAd) continue
    const s = await f.evaluate(() => { const v = document.querySelector('video'); return v ? { t: v.currentTime, paused: v.paused, muted: v.muted, ready: v.readyState } : null }).catch(() => null)
    if (s) return { ...s, frame: f }
  }
  return null
}
const refunds = []

for (const [profile, engine, opts, playback] of [
  ...(process.env.ONLY_MOBILE ? [] : ['x']).map(() => null).filter(Boolean),
  ...(process.env.ONLY_MOBILE ? [] : [['chromium desktop', 'chromium', { viewport: { width: 1440, height: 900 } }, true]]),
  ['Pixel 7', 'chromium', { ...devices['Pixel 7'] }, true],
  ['iPhone 14 (WebKit — layout, taps and login only; it cannot decode video)', 'webkit', { ...devices['iPhone 14'] }, false],
]) {
  console.log(`\n==================== ${profile}`)
  const browser = await pw[engine].launch()
  const ctx = await browser.newContext(opts)
  const page = await ctx.newPage()
  const stamp = Date.now().toString().slice(-9)
  const acct = { email: `e2e+L${stamp}@mtonyo.test`, password: `E2e-L-${stamp}!`, name: `Journey ${stamp}` }
  console.log(`  account: ${acct.email}`)

  leg = 'register'
  await page.goto(`${BASE}/signup`, { waitUntil: 'domcontentloaded' }); await page.waitForSelector('#signup-email', { timeout: 40000 })
  for (const [s, v] of [['#signup-name', acct.name], ['#signup-phone', '0712345678'], ['#signup-email', acct.email], ['#signup-pass', acct.password]]) await page.evaluate(AUTOFILL(s, v))
  const boxes = page.locator('input[type=checkbox]'); for (let i = 0; i < await boxes.count(); i++) await boxes.nth(i).check({ force: true }).catch(() => {})
  await page.locator('button[type=submit]').first().click()
  await page.waitForURL((u) => !/signup/.test(u.pathname), { timeout: 40000 }).catch(() => {})
  check(!/signup|login/.test(new URL(page.url()).pathname), `registered and signed in (landed ${new URL(page.url()).pathname})`)
  const token = await tokenOf(acct.email, acct.password)

  leg = 'browse'
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' }); await page.waitForSelector('a[href*="/watch/"]', { timeout: 40000 })
  check(/Trending/i.test(await page.evaluate(() => document.body.innerText)), 'Home renders, with Trending')
  await page.goto(`${BASE}/explore`, { waitUntil: 'domcontentloaded' }); await page.waitForSelector(`a[href$="/watch/${PAID}"]`, { timeout: 40000 })
  check((await page.locator('a[href*="/watch/"]').count()) >= 8, 'Explore renders the catalogue')

  leg = 'save + creator page from a card'
  const card = page.locator(`a[href$="/watch/${PAID}"]`).first().locator('xpath=ancestor::*[contains(@class,"vcard") or self::article][1]')
  const saveBtn = card.locator('button[aria-label*="Save" i], button[aria-label*="My List" i], button[title*="Save" i]').first()
  if (await saveBtn.count()) { await saveBtn.click(); await page.waitForTimeout(1500) }
  const saved = (await api('GET', '/api/library/saved', token)).body
  check(JSON.stringify(saved).includes(PAID), 'Save to My List from the card is stored')

  leg = 'open from a card'
  await page.locator(`a[href$="/watch/${PAID}"]`).first().click()
  await page.waitForURL(new RegExp(`/watch/${PAID}`), { timeout: 30000 })
  const bar = page.locator('.unlock-bar').first(); await bar.waitFor({ timeout: 40000 })
  check(true, 'the card opens the exact video')
  const pre = (await api('GET', `/api/playback/${PAID}/playback`, token)).body
  check(pre.playback?.kind === 'preview', `before paying: kind=${pre.playback?.kind}, cut-off ${pre.playback?.stopsAtSeconds}s`)
  let stopAt = null
  if (playback) {
    let s = null; for (let i = 0; i < 60 && !(s && s.t > 0.3); i++) { s = await frameState(page); await page.waitForTimeout(500) }
    check(s && s.t > 0.3 && s.muted, `the preview autoplays muted (t=${s?.t?.toFixed(1)}, muted=${s?.muted})`)
    const cut = pre.playback.stopsAtSeconds
    for (let i = 0; i < 30; i++) { const st = await frameState(page); if (st && st.ready >= 1) { await st.frame.evaluate((to) => { document.querySelector('video').currentTime = to }, cut - 5); break } await page.waitForTimeout(500) }
    let h = null; for (let i = 0; i < 40; i++) { const st = await frameState(page); if (st && st.paused && st.t >= cut - 1.5) { h = st; break } await page.waitForTimeout(500) }
    stopAt = h?.t
    check(h && h.t <= cut + 0.5, `the preview stops by itself at the cut-off (${h?.t?.toFixed(1)}s of ${cut}s)`)
  }

  leg = 'pay + resume'
  await page.locator('.unlock-bar button', { hasText: /unlock/i }).first().click()
  await page.waitForSelector('#pay-phone', { timeout: 30000 }); await page.locator('#pay-phone').fill('0712345678')
  await page.locator('.pay-modal button[type=submit]').first().click()
  let closed = false; for (let i = 0; i < 60 && !closed; i++) { await page.waitForTimeout(500); closed = !(await page.locator('.pay-modal').count()) }
  check(closed, 'the sandbox payment completes and the sheet closes itself')
  const post = (await api('GET', `/api/playback/${PAID}/playback`, token)).body
  check(post.playback?.kind === 'full', `after paying: kind=${post.playback?.kind}`)
  refunds.push(acct.email)
  if (playback) {
    let r = null; for (let i = 0; i < 30; i++) { r = await frameState(page); if (r && !r.paused && r.t >= (stopAt ?? 0) - 2) break; await page.waitForTimeout(500) }
    check(r && !r.paused && Math.abs(r.t - (stopAt ?? r.t)) <= 4, `the film continues from the stop point by itself (${r?.t?.toFixed(1)}s vs ${stopAt?.toFixed?.(1)}s), no extra button`)
  }
  check(!(await page.locator('.unlock-bar').count()), 'no paywall left on the page')

  leg = 'follow'
  const follow = page.locator('button.follow-btn, button:has(.follow-label)').first()
  if (await follow.count()) { if (/^Follow$/i.test((await follow.locator('.follow-label').innerText().catch(() => '')).trim())) await follow.click(); await page.waitForTimeout(1500) }
  const following = (await api('GET', '/api/creators/following', token)).body
  check((following.creatorIds || []).length > 0, `Follow from the watch page is stored (${(following.creatorIds || []).length} creator followed)`)

  leg = 'free + ads'
  await page.goto(`${BASE}/watch/${FREE}`, { waitUntil: 'domcontentloaded' })
  let adSeen = false, countdown = null
  for (let i = 0; i < 60 && !countdown; i++) { if (await page.locator('.ad-stage').count()) adSeen = true; if (await page.locator('.ad-skip').count()) countdown = await page.locator('.ad-skip').first().innerText().catch(() => null); await page.waitForTimeout(400) }
  check(adSeen, 'the Free + Ads video shows the advert first')
  if (playback) check(countdown && /Skip in|Skip ad/.test(countdown), `with a countdown once it airs ("${countdown}")`)

  leg = 'continue watching + share'
  await page.goto(`${BASE}/dashboard?tab=library`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(4000)
  const lib = (await api('GET', '/api/library', token)).body
  check(lib.purchased?.some((v) => v.slug === PAID) && lib.myList?.some((v) => v.slug === PAID), 'Library: Purchased and My List hold it')
  if (playback) check(lib.continueWatching?.some((v) => v.slug === PAID), 'Continue Watching holds it after browsing away')
  await page.goto(`${BASE}/watch/${PAID}`, { waitUntil: 'domcontentloaded' })
  await page.locator('button', { hasText: /share/i }).first().click({ timeout: 40000 }); await page.waitForTimeout(2000)
  const wa = await page.locator('a[href^="whatsapp://"], a[href*="whatsapp.com"]').first().getAttribute('href').catch(() => null)
  check(wa && decodeURIComponent(wa).includes(`/watch/${PAID}`), 'Share → WhatsApp carries the exact watch link')
  const og = await (await fetch(`${BASE}/watch/${PAID}?v=L${stamp}`, { headers: { 'user-agent': 'WhatsApp/2.24.15.78 A' } })).text()
  const ogImg = og.match(/property="og:image" content="([^"]+)"/)?.[1]
  const img = ogImg ? await fetch(ogImg) : null
  check(/og:title/.test(og) && img?.status === 200 && /image\/jpeg/.test(img.headers.get('content-type') || ''), 'and WhatsApp gets a rich card for it (title + 200 image/jpeg)')

  leg = 'logout → login'
  await page.goto(`${BASE}/dashboard?tab=settings`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(2500)
  const out = page.locator('button', { hasText: /log out/i }).first()
  const inView = await out.evaluate((el) => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth }).catch(() => false)
  if (!inView) { await page.locator('.dash-top .hamburger').first().click().catch(() => {}); await page.waitForTimeout(800) }
  await out.click()
  await page.waitForTimeout(2500)
  await page.goto(`${BASE}/login?side=viewer`, { waitUntil: 'domcontentloaded' }); await page.waitForSelector('#login-id')
  await page.evaluate(`(() => { const s = (el, v) => Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set.call(el, v); s(document.querySelector('#login-id'), ${JSON.stringify(acct.email)}); s(document.querySelector('#login-pass'), ${JSON.stringify(acct.password)}) })()`)
  await page.locator('button[type=submit]').first().click()
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 }).catch(() => {})
  check(!new URL(page.url()).pathname.startsWith('/login'), 'logs back in on one attempt (autofill-style)')
  await page.goto(`${BASE}/dashboard?tab=library`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(4500)
  const libText = await page.evaluate(() => document.body.innerText)
  check(/Purchased/i.test(libText) && /My List/i.test(libText) && libText.includes('Live at Arusha'), 'Library state survived logout/login (Purchased + My List rows, the film listed)')

  leg = 'cold shared link'
  const cold = await browser.newContext({ ...opts, userAgent: engine === 'chromium' ? 'Mozilla/5.0 (Linux; Android 14; Pixel 7; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0 Mobile Safari/537.36 Instagram 330.0.0.40.92 Android' : undefined })
  const cp = await cold.newPage()
  await cp.goto(`${BASE}/watch/${PAID}?utm_source=share&x=${stamp}`, { waitUntil: 'domcontentloaded' })
  await cp.waitForSelector('.stream-shell, .unlock-bar', { timeout: 40000 }).catch(() => {})
  check(new URL(cp.url()).pathname === `/watch/${PAID}`, 'a cold shared link lands on the exact video')
  if (playback) { let s = null; for (let i = 0; i < 60 && !(s && s.t > 0.3); i++) { s = await frameState(cp); await cp.waitForTimeout(500) } check(s && s.t > 0.3 && s.muted, `and its preview autoplays muted (t=${s?.t?.toFixed(1)})`) }
  await cold.close()

  leg = 'creator public profile'
  await page.goto(`${BASE}/watch/${PAID}`, { waitUntil: 'domcontentloaded' })
  const creatorLink = page.locator('a[href^="/creator/"]').first(); await creatorLink.waitFor({ timeout: 40000 })
  await creatorLink.click(); await page.waitForURL(/\/creator\//, { timeout: 20000 }).catch(() => {}); await page.waitForTimeout(3000)
  const watchLinks = await page.locator('a[href*="/watch/"]').count(), shareBtns = await page.locator('button', { hasText: /share/i }).count()
  check(/\/creator\//.test(page.url()) && watchLinks > 0 && shareBtns > 0, `the creator's public page lists their videos with Watch (${watchLinks}) and Share (${shareBtns})`)
  await browser.close()
}

console.log('\n==================== creator side (demo.asha)')
{
  leg = 'creator'
  const b = await pw.chromium.launch(); const page = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
  await page.goto(`${BASE}/login?side=creator`); await page.waitForSelector('#login-id')
  await page.evaluate(AUTOFILL('#login-id', process.env.CREATOR_EMAIL)); await page.evaluate(AUTOFILL('#login-pass', process.env.CREATOR_PASSWORD))
  await page.locator('button[type=submit]').first().click(); await page.waitForURL(/dashboard/, { timeout: 30000 })
  for (const [tab, re] of [['overview', /Revenue|Views|Earn/i], ['earnings', /Request withdrawal/i], ['capital', /Building Eligibility|of 6 months/i]]) {
    await page.goto(`${BASE}/dashboard?tab=${tab}`); await page.waitForTimeout(3500)
    check(re.test(await page.evaluate(() => document.querySelector('main')?.innerText || '')), `creator ${tab} tab renders its content`)
  }
  const btn = page.locator('button', { hasText: /Request AirPay Review/i }).first()
  check((await btn.count()) === 1 && (await btn.isDisabled()), 'Creator Capital: Request AirPay Review is present and locked until eligible')
  await b.close()
}

console.log('\n==================== Super Admin')
{
  leg = 'admin'
  const at = await tokenOf(process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD)
  const b = await pw.chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const page = await ctx.newPage()
  await page.goto(`${ADMIN_WEB}/login`); await page.waitForSelector('#admin-email')
  await page.evaluate(AUTOFILL('#admin-email', process.env.ADMIN_EMAIL)); await page.evaluate(AUTOFILL('#admin-pass', process.env.ADMIN_PASSWORD))
  await page.locator('button[type=submit]').first().click(); await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 }); await page.waitForTimeout(3000)
  const ov = (await api('GET', '/api/admin/overview', at)).body
  const dash = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
  check(dash.includes(`TOTAL USERS ${ov.users.total}`) && dash.includes(`CREATORS ${ov.users.creators}`), `dashboard numbers match the server (users ${ov.users.total}, creators ${ov.users.creators})`)
  const setS = async (v) => (await api('PATCH', '/api/admin/settings', at, v)).body.settings
  const split0 = (await api('GET', '/api/admin/settings', at)).body.settings.creator_split_percent
  try { await setS({ creator_split_percent: 65 }); check((await api('GET', '/api/stats')).body.creatorSplitPercent === 65, 'revenue split live change reaches the public stats (65)') } finally { await setS({ creator_split_percent: split0 }) }
  check((await api('GET', '/api/stats')).body.creatorSplitPercent === split0, `and is restored (${split0})`)
  const vid = (await api('GET', `/api/playback/${FREE}/playback`)).body.videoId
  const t0 = (await api('GET', '/api/admin/settings', at)).body.settings.preroll_target_seconds
  try { await setS({ preroll_target_seconds: 12 }); const br = (await api('GET', `/api/ads/breaks/${vid}`)).body.ads; check(br.find((a) => a.placement === 'pre_roll')?.prerollTargetSeconds === 12, 'ad control change applies to a real video (pre-roll target 12)') } finally { await setS({ preroll_target_seconds: t0 }) }
  check((await api('GET', '/api/admin/settings', at)).body.settings.preroll_target_seconds === t0, `and is restored (${t0})`)
  await page.goto(`${ADMIN_WEB}/capital`); await page.waitForTimeout(3000)
  check(/Creator Capital/i.test(await page.evaluate(() => document.body.innerText)) && /not the lender/i.test(await page.evaluate(() => document.body.innerText)), 'Creator Capital admin loads with the lender disclaimer')
  const logo = page.locator('aside a[target="_blank"]').first()
  const [tab] = await Promise.all([ctx.waitForEvent('page', { timeout: 10000 }).catch(() => null), logo.click().catch(() => {})])
  check(tab && new URL(tab.url()).origin === new URL(BASE).origin, 'logo opens the public site in a new tab')
  await page.goto(`${ADMIN_WEB}/dashboard`); await page.waitForTimeout(2000)
  check(new URL(page.url()).pathname === '/dashboard', 'and the admin session is still there')
  await b.close()

  leg = 'cleanup'
  console.log(`  accounts to reverse: ${refunds.join(', ')}`)
}
console.log(`\n${fails.length ? `${fails.length} FAILED` : 'ALL PASS'}`)
for (const f of fails) console.log(`  - ${f}`)
