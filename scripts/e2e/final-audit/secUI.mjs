// F2 / F10 / F11 / H3 / I1 / I4 — screen-level checks with screenshots, production.
const pw = await import(process.env.PLAYWRIGHT_MODULE)
const { chromium, devices } = pw
const { BASE, API, ADMIN_WEB, AUD } = process.env
const fails = []
const check = (c, m) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fails.push(m); return c }
const login = async (email, password, side = 'viewer') => (await (await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password, side }) })).json()).session
const b = await chromium.launch()
const pageAs = async (sess, side, opts = { viewport: { width: 1440, height: 900 } }) => {
  const ctx = await b.newContext(opts); const page = await ctx.newPage()
  if (sess) { await page.goto(`${BASE}/login`); await page.evaluate(([s, side]) => { localStorage.setItem('mtonyo.access', s.accessToken); localStorage.setItem('mtonyo.refresh', s.refreshToken); if (side) localStorage.setItem('mtonyo.accountSide', side) }, [sess, side]) }
  return { ctx, page }
}
const STATUSES = ['Building Eligibility', 'Eligibility Unlocked', 'Under AirPay Review', 'Offer Ready', 'Active', 'Repaid', 'Declined', 'Paused']

console.log('### F2 one status at a time')
{
  const { ctx, page } = await pageAs(null)
  await page.goto(`${BASE}/#capital`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(2500)
  const card = page.locator('.cc-status-card').first()
  await card.scrollIntoViewIfNeeded().catch(() => {}); await page.waitForTimeout(800)
  const t = (await card.innerText().catch(() => '')).replace(/\s+/g, ' ')
  const shown = STATUSES.filter((s) => new RegExp(s, 'i').test(t))
  check(shown.length === 1, `homepage example card shows exactly one status: ${JSON.stringify(shown)} — "${t.slice(0, 140)}"`)
  await card.screenshot({ path: `${AUD}/F2-home-example.png` }).catch(() => {})
  await ctx.close()
}
{
  const s = await login(process.env.CREATOR_EMAIL, process.env.CREATOR_PASSWORD, 'creator')
  const { ctx, page } = await pageAs(s, 'creator')
  await page.goto(`${BASE}/dashboard?tab=capital`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(4000)
  const main = (await page.locator('main').innerText().catch(() => '')).replace(/\s+/g, ' ')
  const pills = await page.$$eval('.capital-state .pill, .capital-state .badge, .capital-state h4', (xs) => xs.map((x) => x.innerText.trim()).filter(Boolean))
  const shown = STATUSES.filter((s) => new RegExp(`\\b${s}\\b`, 'i').test(main))
  console.log(`     creator tab status pills: ${JSON.stringify(pills)}; status words present: ${JSON.stringify(shown)}`)
  check(new Set(pills).size <= 1, `a real account (demo.asha) shows one live status pill: ${JSON.stringify([...new Set(pills)])}`)
  await page.screenshot({ path: `${AUD}/F2-creator-capital-tab.png`, fullPage: true })
  await ctx.close()
}

console.log('\n### F10 /creator-capital visual, F11 navigation')
for (const [label, opts] of [['desktop', { viewport: { width: 1440, height: 900 } }], ['mobile', { ...devices['Pixel 7'] }]]) {
  const { ctx, page } = await pageAs(null, null, opts)
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(2000)
  let navLink = await page.locator('header a[href="/creator-capital"], nav a[href="/creator-capital"]').first().isVisible().catch(() => false)
  if (!navLink && label === 'mobile') {
    await page.locator('button.hamburger').first().click().catch(() => {}); await page.waitForTimeout(700)
    navLink = await page.locator('.mobile-menu.open a[href="/creator-capital"]').first().isVisible().catch(() => false)
  }
  check(navLink, `F11 ${label}: Creator Capital is in the main navigation`)
  if (navLink) { await page.locator(label === 'mobile' ? '.mobile-menu.open a[href="/creator-capital"]' : 'header a[href="/creator-capital"]').first().click(); await page.waitForTimeout(2500) } else await page.goto(`${BASE}/creator-capital`)
  check(new URL(page.url()).pathname === '/creator-capital', `F11 ${label}: it goes straight to the info page (${new URL(page.url()).pathname})`)
  const parts = await page.evaluate(() => ({
    steps: document.querySelectorAll('.cc-step').length,
    journey: document.querySelectorAll('.cc-journey-item').length,
    uses: [...document.querySelectorAll('h2, h3, h4')].some((h) => /use your funding|funding for/i.test(h.innerText)) || /Use your funding for/i.test(document.body.innerText),
    who: !!document.querySelector('.notice.notice-review'),
    card: !!document.querySelector('.cc-status-card'),
    cta: [...document.querySelectorAll('a.btn, button.btn')].filter((x) => x.getBoundingClientRect().top > document.body.scrollHeight * 0.6 || true).length,
    legalShell: document.querySelectorAll('.legal-body').length,
    disclaimers: (document.body.innerText.match(/MTONYO\+ is not the lender\s*—\s*AirPay Microfinance decides eligibility, approval and financing terms\./g) || []).length,
    overflow: document.documentElement.scrollWidth > innerWidth + 1,
  }))
  console.log(`     ${label}: ${JSON.stringify(parts)}`)
  check(parts.steps === 4 && parts.journey === 5 && parts.who && parts.card && parts.legalShell === 0 && !parts.overflow, `F10 ${label}: hero + 4-step flow + status journey + "Who decides" card + approved-offer card, no Word-page shell, no sideways scroll`)
  check(parts.uses, `F10 ${label}: a "Use your funding for" section exists`)
  await page.screenshot({ path: `${AUD}/F10-creator-capital-${label}.png`, fullPage: true })
  await ctx.close()
}

console.log('\n### H3 the payment sheet')
{
  const s = await login(process.env.E2E_EMAIL, process.env.E2E_PASSWORD)
  const { ctx, page } = await pageAs(s)
  await page.goto(`${BASE}/watch/rpreplay-final1589783013-2`, { waitUntil: 'domcontentloaded' })
  await page.locator('button', { hasText: /unlock/i }).first().click({ timeout: 60000 })
  await page.waitForSelector('#pay-phone', { timeout: 30000 }); await page.waitForTimeout(1200)
  const sheet = (await page.locator('.pay-modal .pay-card').first().innerText().catch(() => '')).replace(/\s+/g, ' ')
  const imgs = await page.$$eval('.pay-modal img', (xs) => xs.map((x) => (x.getAttribute('alt') || '') + ' ' + x.src.split('/').pop()))
  check(!/visa|mastercard/i.test(sheet + imgs.join(' ')), `no Visa/Mastercard on the sheet (images: ${JSON.stringify(imgs)})`)
  check(/M-?Pesa/i.test(sheet) && /Airtel/i.test(sheet), 'M-Pesa and Airtel Money are the methods offered')
  console.log(`     sheet text: "${sheet.slice(0, 220)}"`)
  await page.locator('.pay-modal .pay-card').first().screenshot({ path: `${AUD}/H3-payment-sheet.png` })
  await ctx.close()
}

console.log('\n### I4 Library badges not covered')
{
  const s = await login(process.env.E2E_EMAIL, process.env.E2E_PASSWORD)
  for (const [label, opts] of [['desktop', { viewport: { width: 1440, height: 900 } }], ['mobile', { ...devices['Pixel 7'] }]]) {
    const { ctx, page } = await pageAs(s, 'viewer', opts)
    await page.goto(`${BASE}/dashboard?tab=library`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(4500)
    const r = await page.evaluate(() => {
      const out = []
      for (const badge of document.querySelectorAll('main .vtype, main [class*="badge"], main .pill')) {
        const t = (badge.textContent || '').trim(); if (!/FREE|PAY ONCE|PREMIERE/i.test(t)) continue
        const bb = badge.getBoundingClientRect(); if (!bb.width) continue
        const card = badge.closest('article, .vcard, .card, li') || badge.parentElement
        const covered = [...card.querySelectorAll('button, [role="button"], .x, [class*="remove"], [class*="close"], svg')].filter((el) => !badge.contains(el) && el !== badge).some((el) => { const e = el.getBoundingClientRect(); return e.width && !(e.right <= bb.left || e.left >= bb.right || e.bottom <= bb.top || e.top >= bb.bottom) })
        const cx = bb.left + bb.width / 2, cy = bb.top + bb.height / 2
        const top = document.elementFromPoint(cx, cy)
        out.push({ t, covered, topIsBadge: !!top && (badge === top || badge.contains(top)) })
      }
      return out
    })
    const bad = r.filter((x) => x.covered || !x.topIsBadge)
    console.log(`     ${label}: ${r.length} access badges — ${JSON.stringify(r)}`)
    check(r.length > 0 && bad.length === 0, `I4 ${label}: every access badge is on top and nothing overlaps it`)
    await page.screenshot({ path: `${AUD}/I4-library-${label}.png`, fullPage: true })
    await ctx.close()
  }
}

console.log('\n### I1 admin logo -> public homepage, admin session kept')
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const page = await ctx.newPage()
  await page.goto(`${ADMIN_WEB}/login`); await page.waitForSelector('#admin-email')
  const fill = (s, v) => page.evaluate(([s, v]) => { const el = document.querySelector(s); Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }, [s, v])
  await fill('#admin-email', process.env.ADMIN_EMAIL); await fill('#admin-pass', process.env.ADMIN_PASSWORD)
  await page.locator('button[type=submit]').first().click(); await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 40000 }); await page.waitForTimeout(2000)
  const logo = page.locator('aside a:has(img), aside a.logo, a.brand, a[class*="logo"]').first()
  const attrs = { href: await logo.getAttribute('href').catch(() => null), target: await logo.getAttribute('target').catch(() => null) }
  const [popup] = await Promise.all([ctx.waitForEvent('page', { timeout: 10000 }).catch(() => null), logo.click().catch(() => {})])
  if (popup) await popup.waitForLoadState('domcontentloaded').catch(() => {})
  check(attrs.target === '_blank' && popup && new URL(popup.url()).origin === new URL(BASE).origin, `logo opens the public homepage in a new tab (href=${attrs.href}, target=${attrs.target}, opened=${popup?.url()})`)
  await page.bringToFront(); await page.goto(`${ADMIN_WEB}/dashboard`); await page.waitForTimeout(2500)
  check(new URL(page.url()).pathname === '/dashboard', `admin session survives going to the public site and back (${new URL(page.url()).pathname})`)
  await ctx.close()
}
await b.close()
console.log(`\n${fails.length ? `${fails.length} FAILED` : 'ALL PASS'}`)
for (const f of fails) console.log(`  - ${f}`)
