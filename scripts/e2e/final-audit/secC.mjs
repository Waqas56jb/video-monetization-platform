// C1 + C2: the split on every surface (API + rendered DOM), at the live value, flipped to 65, and restored.
const pw = await import(process.env.PLAYWRIGHT_MODULE)
const { chromium } = pw
const { BASE, API, ADMIN_WEB } = process.env
const FLIP = Number(process.env.FLIP || 65)
const VIEWER = { email: process.env.VIEWER_ONLY_EMAIL, password: process.env.VIEWER_ONLY_PASSWORD } // any viewer-only account
const CREATOR = { email: process.env.CREATOR_EMAIL, password: process.env.CREATOR_PASSWORD }
const ADMIN = { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }

const login = async (a, side = 'viewer') => (await (await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...a, side }) })).json()).session
const get = async (p, t) => (await fetch(`${API}${p}`, { headers: t ? { authorization: `Bearer ${t}` } : {} })).json()
const adminS = await login(ADMIN)
const creatorS = await login(CREATOR, 'creator')
const viewerS = await login(VIEWER)
const patch = async (v) => (await (await fetch(`${API}/api/admin/settings`, { method: 'PATCH', headers: { 'content-type': 'application/json', authorization: `Bearer ${adminS.accessToken}` }, body: JSON.stringify({ creator_split_percent: v }) })).json()).settings.creator_split_percent

const browser = await chromium.launch()
async function pageAs(session, base) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  if (session) {
    await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded', timeout: 90000 })
    await page.evaluate((s) => { localStorage.setItem('mtonyo.access', s.accessToken); if (s.refreshToken) localStorage.setItem('mtonyo.refresh', s.refreshToken) }, session)
  }
  return { ctx, page }
}
const text = async (page, url, waitFor) => {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 })
  if (waitFor) await page.waitForFunction(waitFor, null, { timeout: 45000 }).catch(() => {})
  await page.waitForTimeout(1500)
  return page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
}
const m = (s, re) => (s.match(re) || [])[1] ?? '—'

async function adminLogin() {
  const { ctx, page } = await pageAs(null, ADMIN_WEB)
  await page.goto(`${ADMIN_WEB}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#admin-email', { timeout: 40000 })
  const fill = (sel, v) => page.evaluate(([sel, v]) => { const el = document.querySelector(sel); const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value'); d.set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })) }, [sel, v])
  await fill('#admin-email', ADMIN.email); await fill('#admin-pass', ADMIN.password)
  await page.locator('button[type=submit]').first().click()
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 40000 })
  return { ctx, page }
}

async function read(label) {
  const r = {}
  r['API /api/stats creatorSplitPercent'] = (await get('/api/stats')).creatorSplitPercent ?? (await get('/api/stats')).stats?.creatorSplitPercent
  r['API /api/admin/settings'] = (await get('/api/admin/settings', adminS.accessToken)).settings.creator_split_percent
  r['API /api/admin/revenue defaultSplitPercent'] = (await get('/api/admin/revenue', adminS.accessToken)).defaultSplitPercent
  r['API /api/earnings splitPercent (creator)'] = (await get('/api/earnings', creatorS.accessToken)).splitPercent

  const anon = await pageAs(null, BASE)
  const home = await text(anon.page, `${BASE}/`, () => /Of every sale is yours/.test(document.body.innerText))
  r['Home hero stat "Of every sale is yours"'] = m(home, /(\d+)%\s*Of every sale is yours/i)
  r['Home testimonials "You keep X% of every sale"'] = m(home, /You keep (\d+)% of every sale/i)
  r['Home For Creators flow (aria-label)'] = await anon.page.evaluate(() => (document.querySelector('.flow[role="img"]')?.getAttribute('aria-label')?.match(/splits (\d+)%/) || [])[1] ?? '—')
  await anon.ctx.close()

  const viewer = await pageAs(viewerS, BASE)
  const become = await text(viewer.page, `${BASE}/dashboard?tab=become`, () => /Keep \d+% of every sale/.test(document.body.innerText))
  r['Viewer "Apply to become a Creator" tab'] = m(become, /Keep (\d+)% of every sale/i)
  await viewer.ctx.close()

  const creator = await pageAs(creatorS, BASE)
  const earn = await text(creator.page, `${BASE}/dashboard?tab=earnings`, () => /You keep \d+% of both/.test(document.body.innerText))
  r['Creator dashboard Earnings "You keep X% of both"'] = m(earn, /You keep (\d+)% of both/i)
  await creator.ctx.close()

  const admin = await adminLogin()
  const dash = await text(admin.page, `${ADMIN_WEB}/dashboard`, () => /Current Global Split/.test(document.body.innerText))
  r['Super Admin dashboard "Current Global Split"'] = m(dash, /Current Global Split · (\d+)% Creator/i)
  const cre = await text(admin.page, `${ADMIN_WEB}/creators`, () => document.querySelectorAll('tbody tr').length > 1)
  r['Creator Management — split column (default-split rows)'] = [...new Set((await admin.page.$$eval('tbody tr', (trs) => trs.map((tr) => [...tr.children].map((td) => td.innerText.trim()).find((t) => /^\d+%$/.test(t))).filter(Boolean))))].join(',')
  const rev = await text(admin.page, `${ADMIN_WEB}/revenue`, () => document.body.innerText.length > 200)
  r['Revenue & Splits — slider/input value'] = await admin.page.evaluate(() => [...document.querySelectorAll('input')].map((i) => i.value).filter((v) => /^\d+$/.test(v)).join(',') || '—')
  r['Revenue & Splits — text'] = m(rev, /(\d+)% (?:to )?(?:the )?[Cc]reator/)
  await text(admin.page, `${ADMIN_WEB}/settings`, () => !!document.querySelector('#set-split'))
  r['Settings #set-split'] = await admin.page.evaluate(() => document.querySelector('#set-split')?.value ?? '—')
  await admin.ctx.close()

  console.log(`\n### ${label}`)
  for (const [k, v] of Object.entries(r)) console.log(`  ${k.padEnd(58)} ${v}`)
  return r
}

const original = (await get('/api/admin/settings', adminS.accessToken)).settings.creator_split_percent
console.log(`live split before the test: ${original}`)
try {
  await read(`AT LIVE VALUE (${original})`)
  console.log(`\nPATCH creator_split_percent -> ${await patch(FLIP)}`)
  await read(`FLIPPED TO ${FLIP}`)
} finally {
  console.log(`\nPATCH creator_split_percent -> ${await patch(original)} (restore)`)
}
await read(`RESTORED (${original})`)
await browser.close()
