const pw = await import(process.env.PLAYWRIGHT_MODULE)
const { chromium, devices } = pw
const { BASE, API } = process.env
const s = (await (await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: process.env.E2E_EMAIL, password: process.env.E2E_PASSWORD, side: 'viewer' }) })).json()).session
const b = await chromium.launch()
for (const [label, opts] of [['desktop', { viewport: { width: 1440, height: 900 } }], ['Pixel 7', { ...devices['Pixel 7'] }], ['375px', { ...devices['iPhone SE'], viewport: { width: 375, height: 667 } }]]) {
  const page = await (await b.newContext(opts)).newPage()
  await page.goto(`${BASE}/login`); await page.evaluate((s) => { localStorage.setItem('mtonyo.access', s.accessToken); localStorage.setItem('mtonyo.refresh', s.refreshToken) }, s)
  await page.goto(`${BASE}/dashboard?tab=library`, { waitUntil: 'domcontentloaded' }); await page.waitForTimeout(5000)
  const r = await page.evaluate(() => [...document.querySelectorAll('main [class*="tag-"]')].map((badge) => {
    badge.scrollIntoView({ block: 'center' })
    const bb = badge.getBoundingClientRect()
    const card = badge.closest('article') || badge.parentElement.parentElement
    const others = [...card.querySelectorAll('button, a, [role="button"]')].filter((el) => !badge.contains(el) && !el.contains(badge))
    const overlap = others.filter((el) => { const e = el.getBoundingClientRect(); return e.width && !(e.right <= bb.left || e.left >= bb.right || e.bottom <= bb.top || e.top >= bb.bottom) }).map((el) => el.className || el.tagName)
    const top = document.elementFromPoint(bb.left + bb.width / 2, bb.top + bb.height / 2)
    return { t: badge.textContent.trim(), overlap, onTop: !!top && (badge === top || badge.contains(top)) }
  }))
  const bad = r.filter((x) => x.overlap.length || !x.onTop)
  console.log(`${bad.length ? 'FAIL' : 'PASS'}  ${label}: ${r.length} access badges (${[...new Set(r.map((x) => x.t))].join(', ')}) — overlapped or hidden: ${bad.length}${bad.length ? ' ' + JSON.stringify(bad) : ''}`)
  await page.screenshot({ path: `${process.env.AUD}/I4-library-${label.replace(/\s/g, '')}.png` })
  await page.context().close()
}
await b.close()
