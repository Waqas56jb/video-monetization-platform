// Section D (D1-D5): fresh viewer-only + fresh dual-role accounts, API shapes, every tab, the switch button.
const pw = await import(process.env.PLAYWRIGHT_MODULE)
const { chromium } = pw
const { BASE, API } = process.env
const fails = []
const check = (c, m) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fails.push(m); return c }
const post = (p, b, t) => fetch(`${API}${p}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(t ? { authorization: `Bearer ${t}` } : {}) }, body: JSON.stringify(b) }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }))
const get = (p, t) => fetch(`${API}${p}`, { headers: t ? { authorization: `Bearer ${t}` } : {} }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => ({})) }))

const stamp = Date.now().toString().slice(-9)
const pass = `E2e-Audit-${stamp}!`
const viewerEmail = `e2e+aud-v${stamp}@mtonyo.test`
const dualEmail = `e2e+aud-d${stamp}@mtonyo.test`
console.log(`accounts created by this run: ${viewerEmail}, ${dualEmail} (password ${pass})`)

/* Creator-only data that must never reach a Watch-side response. Keys, at any depth. */
const FORBIDDEN = ['payoutPhone', 'payoutMethod', 'payout_phone', 'payout_method', 'revenueSplitPercent', 'revenue_split_percent', 'splitPercent', 'category', 'socials', 'instagram', 'tiktok', 'youtube', 'followers', 'followerCount', 'lifetimeTzs', 'earnings', 'verified', 'location', 'bio']
function leaks(obj, path = '') {
  const out = []
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      const p = path ? `${path}.${k}` : k
      if (FORBIDDEN.includes(k) && v != null && v !== '' && !(Array.isArray(v) && !v.length)) out.push(`${p}=${JSON.stringify(v).slice(0, 40)}`)
      out.push(...leaks(v, p))
    }
  }
  return out
}
const creatorKeys = (o) => (o?.creator && typeof o.creator === 'object' ? Object.keys(o.creator) : o?.creator === null ? 'null' : 'absent')

/* ---------- accounts ---------- */
const reg = (email, side) => post('/api/auth/register', { email, password: pass, fullName: 'Audit Probe', phone: '0712345678', side, role: side })
const v1 = await reg(viewerEmail, 'viewer')
check(v1.status === 201, `viewer-only account created (${v1.status})`)
const d1 = await reg(dualEmail, 'creator')
const d2 = await reg(dualEmail, 'viewer')
check(d1.status === 201 && [200, 201].includes(d2.status), `dual account: Create side ${d1.status}, Watch side added ${d2.status} (sides=${JSON.stringify(d2.body.sides)})`)
// a creator profile with real creator-only data, so a leak would have something to leak
const dc = await post('/api/auth/login', { email: dualEmail, password: pass, side: 'creator' })
const ct = dc.body.session?.accessToken
const upd = await fetch(`${API}/api/account`, { method: 'PATCH', headers: { 'content-type': 'application/json', authorization: `Bearer ${ct}` }, body: JSON.stringify({ displayName: 'Audit Dual', category: 'Music', bio: 'creator bio text', socials: ['https://instagram.com/auditdual'], payoutPhone: '0712999888', payoutMethod: 'mpesa', currentPassword: pass }) }).then((r) => r.status).catch(() => 'n/a')
console.log(`  (filled the Create profile with category/bio/payout/socials: PATCH /api/account -> ${upd})`)

/* ---------- D1 / D2: API shapes on the Watch side ---------- */
for (const [label, email] of [['D1 viewer-only', viewerEmail], ['D2 dual-role, WATCH side', dualEmail]]) {
  console.log(`\n### ${label} — API`)
  const li = await post('/api/auth/login', { email, password: pass, side: 'viewer' })
  const t = li.body.session?.accessToken
  const resp = { 'POST /api/auth/login': li.body, 'GET /api/auth/me': (await get('/api/auth/me', t)).body, 'GET /api/account': (await get('/api/account', t)).body, 'GET /api/account/analytics': (await get('/api/account/analytics', t)).body }
  for (const [ep, body] of Object.entries(resp)) {
    const l = leaks(body)
    check(l.length === 0, `${ep}: no creator-only fields${l.length ? ` — LEAK ${l.join(', ')}` : ''} (creator: ${JSON.stringify(creatorKeys(body))})`)
  }
  const an = resp['GET /api/account/analytics']
  check(!an.creator && !an.studio, `analytics on the Watch side carries no creator block (keys: ${Object.keys(an).join(',')})`)
}

/* ---------- D1 / D3 / D4 / D5: screens ---------- */
const browser = await chromium.launch()
async function open(email, side) {
  const s = (await post('/api/auth/login', { email, password: pass, side })).body.session
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/login`)
  await page.evaluate(([s, side]) => { localStorage.setItem('mtonyo.access', s.accessToken); localStorage.setItem('mtonyo.refresh', s.refreshToken); localStorage.setItem('mtonyo.accountSide', side) }, [s, side])
  return { ctx, page }
}
const tabText = async (page, tab) => {
  await page.goto(`${BASE}/dashboard?tab=${tab}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3500)
  return page.evaluate(() => (document.querySelector('main') || document.body).innerText.replace(/\s+/g, ' '))
}
const CREATOR_WORDS = /payout|revenue split|your earnings|followers|Tell people what you make|approval|approved|rejected|category|Upload|Creator Capital status|Studio/i

for (const [label, email] of [['D1 viewer-only', viewerEmail], ['D2 dual-role on WATCH side', dualEmail]]) {
  console.log(`\n### ${label} — every Watch tab`)
  const { ctx, page } = await open(email, 'viewer')
  for (const tab of ['library', 'purchases', 'analytics', 'profile', 'settings']) {
    const t = await tabText(page, tab)
    const hit = t.match(CREATOR_WORDS)
    check(!hit, `tab ${tab}: no creator wording${hit ? ` — found "${hit[0]}" in "…${t.slice(Math.max(0, hit.index - 40), hit.index + 40)}…"` : ''}`)
  }
  const nav = await page.$$eval('aside a, aside button', (xs) => xs.map((x) => x.innerText.trim()).filter(Boolean))
  console.log(`  sidebar: ${nav.join(' | ')}`)
  check(!nav.some((n) => /Upload|Earnings|My Videos|Creator Capital/i.test(n)), 'no creator tools in the Watch sidebar')
  await ctx.close()
}

console.log('\n### D3 dual-role, CREATE side — Analytics')
{
  const { ctx, page } = await open(dualEmail, 'creator')
  const t = await tabText(page, 'analytics')
  const viewerHit = t.match(/In your library|Total spent|Watch time in your library|what you bought|\bPurchases\b/i)
  check(!viewerHit, `Create-side analytics shows no viewer metrics${viewerHit ? ` — found "${viewerHit[0]}"` : ''}`)
  const want = ['Views', 'Unlock', 'Conversion', 'Earn', 'Published']
  const missing = want.filter((w) => !new RegExp(w, 'i').test(t))
  check(missing.length === 0, `and shows creator metrics (${want.join(', ')})${missing.length ? ` — missing ${missing.join(',')}` : ''}`)
  console.log(`  text: ${t.slice(0, 260)}…`)

  console.log('\n### D5 the Viewer↔Creator switch, clicked')
  const sw = page.locator('aside button.side-link', { hasText: /Open (Viewer|Creator) side/ })
  check(await sw.count() === 1, `switch control present on a real (non-staff) dual account: "${(await sw.first().innerText().catch(() => '')).trim()}"`)
  const before = await page.$$eval('aside a, aside button', (xs) => xs.map((x) => x.innerText.trim()).filter(Boolean).join('|'))
  await sw.first().click()
  await page.waitForTimeout(2500)
  const after = await page.$$eval('aside a, aside button', (xs) => xs.map((x) => x.innerText.trim()).filter(Boolean).join('|'))
  const side1 = await page.evaluate(() => localStorage.getItem('mtonyo.accountSide'))
  check(before !== after && side1 === 'viewer' && /tab=library/.test(page.url()), `click 1: Create → Watch (side=${side1}, url=${page.url().replace(BASE, '')}, sidebar now: ${after.slice(0, 90)})`)
  await page.locator('aside button.side-link', { hasText: /Open Creator side/ }).first().click()
  await page.waitForTimeout(2500)
  const side2 = await page.evaluate(() => localStorage.getItem('mtonyo.accountSide'))
  const back = await page.$$eval('aside a, aside button', (xs) => xs.map((x) => x.innerText.trim()).filter(Boolean).join('|'))
  check(side2 === 'creator' && /tab=overview/.test(page.url()) && back === before, `click 2: Watch → Create (side=${side2}, url=${page.url().replace(BASE, '')})`)
  await ctx.close()
}
{
  const { ctx, page } = await open(viewerEmail, 'viewer')
  await page.goto(`${BASE}/dashboard?tab=library`); await page.waitForTimeout(3000)
  check(await page.locator('aside button.side-link', { hasText: /Open (Viewer|Creator) side/ }).count() === 0, 'a viewer-only account is not offered a switch (it has no Create side)')
  await ctx.close()
}
await browser.close()
console.log(`\n${fails.length ? `${fails.length} FAILED` : 'ALL PASS'}`)
for (const f of fails) console.log(`  - ${f}`)
