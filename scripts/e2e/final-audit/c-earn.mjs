const pw = await import(process.env.PLAYWRIGHT_MODULE)
const { BASE, API } = process.env
const login = async (a, side) => (await (await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...a, side }) })).json()).session
const admin = await login({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD }, 'viewer')
const creator = await login({ email: process.env.CREATOR_EMAIL, password: process.env.CREATOR_PASSWORD }, 'creator')
const patch = async (v) => (await (await fetch(`${API}/api/admin/settings`, { method: 'PATCH', headers: { 'content-type': 'application/json', authorization: `Bearer ${admin.accessToken}` }, body: JSON.stringify({ creator_split_percent: v }) })).json()).settings.creator_split_percent
const b = await pw.chromium.launch()
const read = async (label) => {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } }); const page = await ctx.newPage()
  await page.goto(`${BASE}/login`)
  await page.evaluate((s) => { localStorage.setItem('mtonyo.access', s.accessToken); localStorage.setItem('mtonyo.refresh', s.refreshToken); localStorage.setItem('mtonyo.accountSide', 'creator') }, creator)
  await page.goto(`${BASE}/dashboard?tab=earnings`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => /You keep \d+% of both/.test(document.body.innerText), null, { timeout: 45000 }).catch(() => {})
  const t = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
  console.log(`${label.padEnd(10)} creator Earnings tab: "${(t.match(/You keep \d+% of both/) || ['—'])[0]}"  (url ${page.url().replace(BASE, '')})`)
  await ctx.close()
}
try { await read('live'); console.log(`PATCH -> ${await patch(65)}`); await read('flipped') } finally { console.log(`PATCH -> ${await patch(70)} (restore)`) }
await read('restored')
await b.close()
