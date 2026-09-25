// E7: one submit signs in, for viewer, creator and admin — fields filled the way autofill fills them (value set, NO input event).
const pw = await import(process.env.PLAYWRIGHT_MODULE)
const { BASE, ADMIN_WEB } = process.env
const fails = []
const AUTOFILL = (sel, v) => `(() => { const el = document.querySelector(${JSON.stringify(sel)}); const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value'); d.set.call(el, ${JSON.stringify(v)}) })()`
const CASES = [
  ['viewer', `${BASE}/login?side=viewer`, '#login-id', '#login-pass', process.env.E2E_EMAIL, process.env.E2E_PASSWORD, (u) => !u.pathname.startsWith('/login')],
  ['creator', `${BASE}/login?side=creator`, '#login-id', '#login-pass', process.env.CREATOR_EMAIL, process.env.CREATOR_PASSWORD, (u) => u.pathname.startsWith('/dashboard')],
  ['admin', `${ADMIN_WEB}/login`, '#admin-email', '#admin-pass', process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD, (u) => !u.pathname.startsWith('/login')],
]
for (const engine of ['chromium', 'webkit']) {
  const b = await pw[engine].launch()
  for (const [role, url, idSel, passSel, email, pass, landed] of CASES) {
    const page = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
    let submits = 0
    page.on('request', (r) => { if (/\/api\/auth\/login$/.test(r.url()) && r.method() === 'POST') submits++ })
    await page.goto(url, { waitUntil: 'domcontentloaded' }); await page.waitForSelector(idSel, { timeout: 40000 }); await page.waitForTimeout(800)
    await page.evaluate(AUTOFILL(idSel, email)); await page.evaluate(AUTOFILL(passSel, pass))
    const t0 = Date.now()
    await page.locator('button[type=submit]').first().click()
    let ok = false
    for (let i = 0; i < 60 && !ok; i++) { await page.waitForTimeout(250); ok = landed(new URL(page.url())) }
    const side = role === 'creator' ? await page.evaluate(() => localStorage.getItem('mtonyo.accountSide')) : ''
    const line = `${engine.padEnd(8)} ${role.padEnd(7)} one click → ${ok ? `signed in, at ${new URL(page.url()).pathname}${side ? ` (side=${side})` : ''}` : 'NOT signed in'} in ${Date.now() - t0} ms · login requests sent: ${submits}`
    console.log(`  ${ok && submits === 1 ? 'PASS' : 'FAIL'}  ${line}`)
    if (!(ok && submits === 1)) fails.push(line)
    await page.context().close()
  }
  await b.close()
}
console.log(fails.length ? `${fails.length} FAILED` : 'ALL PASS')
