// E6: one tap on the primary controls (not only cards) reacts, on touch profiles with and without a mouse.
const pw = await import(process.env.PLAYWRIGHT_MODULE)
const { chromium, webkit, devices } = pw
const { BASE, API } = process.env
const fails = []
const check = (c, m) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fails.push(m) }
const s = (await (await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: process.env.E2E_EMAIL, password: process.env.E2E_PASSWORD, side: 'viewer' }) })).json()).session
const PROFILES = [
  ['iPad Pro 11 + mouse (webkit)', webkit, { ...devices['iPad Pro 11'], hasTouch: true, isMobile: false }],
  ['Pixel 7 (chromium)', chromium, { ...devices['Pixel 7'] }],
]
const tap = async (page, loc) => { const bb = await loc.boundingBox(); await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2) }
for (const [name, engine, opts] of PROFILES) {
  console.log(`\n### ${name}`)
  const b = await engine.launch()
  // signed out: logo, login
  {
    const page = await (await b.newContext(opts)).newPage()
    await page.goto(`${BASE}/explore`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(2500)
    await tap(page, page.locator('header a[href="/"]').first()); await page.waitForTimeout(1500)
    check(new URL(page.url()).pathname === '/', `logo: one tap → / (${new URL(page.url()).pathname})`)
    const burger = page.locator('button.hamburger').first()
    if (await burger.isVisible().catch(() => false)) { await tap(page, burger); await page.waitForTimeout(600); await tap(page, page.locator('button, a', { hasText: /^\s*Log in\s*$/i }).last()) } else await tap(page, page.locator('.nav-cta-login').first())
    await page.waitForTimeout(1500)
    check(/\/login/.test(page.url()), `Log in: one tap opens sign-in (${new URL(page.url()).pathname})`)
    await page.context().close()
  }
  // signed in: unlock, share, follow
  {
    const ctx = await b.newContext(opts); const page = await ctx.newPage()
    await page.goto(`${BASE}/login`); await page.evaluate((s) => { localStorage.setItem('mtonyo.access', s.accessToken); localStorage.setItem('mtonyo.refresh', s.refreshToken) }, s)
    await page.goto(`${BASE}/watch/rpreplay-final1589783013-2`, { waitUntil: 'domcontentloaded' })
    const unlock = page.locator('.unlock-bar button', { hasText: /unlock/i }).first(); await unlock.waitFor({ timeout: 40000 })
    await tap(page, unlock); await page.waitForTimeout(1200)
    check(await page.locator('#pay-phone').isVisible().catch(() => false), 'Unlock: one tap opens the payment sheet')
    await page.keyboard.press('Escape'); await page.goto(`${BASE}/watch/live-at-arusha-full-set`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(3500)
    const share = page.locator('button', { hasText: /share/i }).first(); await share.waitFor({ timeout: 40000 })
    await tap(page, share); await page.waitForTimeout(1500)
    check(await page.locator('a[href^="whatsapp://"], a[href*="whatsapp.com"]').first().isVisible().catch(() => false), 'Share: one tap opens the share sheet')
    await page.keyboard.press('Escape'); await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(3500)
    const follow = page.locator('button', { hasText: /^\s*(Follow|Following)\s*$/i }).first()
    if (await follow.isVisible().catch(() => false)) {
      const before = (await follow.innerText()).trim()
      await tap(page, follow); await page.waitForTimeout(1500)
      const after = (await follow.innerText()).trim()
      check(before !== after, `Follow: one tap toggles (${before} → ${after})`)
      await tap(page, follow); await page.waitForTimeout(1500) // put it back
      console.log(`     restored: ${(await follow.innerText()).trim()}`)
    } else check(false, 'Follow control visible on the watch page')
    await ctx.close()
  }
  await b.close()
}
console.log(`\n${fails.length ? `${fails.length} FAILED` : 'ALL PASS'}`)
