/**
 * The same account-side rules, through the screens a person actually uses.
 *
 * `account-sides.mjs` proves the API. This proves the half that was also wrong:
 * the client forced every Create signup onto the Watch side and routed it to the
 * application form, so even a correct server would have put the person in the
 * wrong place. The client reported it from the sign-up page, so it is checked
 * from the sign-up page.
 *
 *   PLAYWRIGHT_MODULE=file:///… node scripts/e2e/signup-sides-ui.mjs
 */
const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const { devices } = pw

const BASE = process.env.BASE || 'https://video-monetization-platform-chi.vercel.app'

const ok = (c, m) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${m}`); return Boolean(c) }
const fails = []
const check = (c, m) => { if (!ok(c, m)) fails.push(m); return Boolean(c) }

const FILL = (sel, v) => `(() => {
  const el = document.querySelector(${JSON.stringify(sel)})
  if (!el) return false
  const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')
  d.set.call(el, ${JSON.stringify(v)})
  el.dispatchEvent(new Event('input', { bubbles: true }))
  return true
})()`

const PROFILES = [
  ['chromium desktop', 'chromium', { viewport: { width: 1440, height: 900 } }],
  ['iPhone 14 · webkit', 'webkit', { ...devices['iPhone 14'] }],
]
const only = process.env.PROFILES ? process.env.PROFILES.split(',').map((s) => s.trim()) : null

for (const [name, engine, opts] of PROFILES) {
  if (only && !only.includes(name)) continue
  console.log(`\n### ${name}`)
  const browser = await pw[engine].launch()
  const ctx = await browser.newContext(opts)
  const page = await ctx.newPage()

  const stamp = Date.now().toString().slice(-9)
  const email = `e2e+ui${stamp}@mtonyo.test`
  const password = `E2e-Ui-${stamp}!`

  const signOut = async () => {
    await ctx.clearCookies()
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 120000 })
    await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear() } catch {} }).catch(() => {})
  }

  /** Choose Watch or Create on the role toggle, whatever it is called. */
  const pickSide = async (side) => {
    const label = side === 'creator' ? /create/i : /watch/i
    const btn = page.locator('.role-toggle button', { hasText: label }).first()
    if (await btn.count()) await btn.click()
    await page.waitForTimeout(400)
  }

  /* ------------------------------------------- sign up on CREATE --------- */
  await signOut()
  await page.goto(`${BASE}/signup?side=creator`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForSelector('#signup-email', { timeout: 40000 })
  await page.waitForTimeout(1200)
  await pickSide('creator')
  await page.evaluate(FILL('#signup-name', 'UI Side Probe'))
  await page.evaluate(FILL('#signup-phone', '0712345678')).catch(() => {})
  await page.evaluate(FILL('#signup-email', email))
  await page.evaluate(FILL('#signup-pass', password))
  for (const box of await page.locator('input[type=checkbox]').all()) {
    if (!(await box.isChecked().catch(() => true))) await box.check({ force: true }).catch(() => {})
  }
  await page.locator('button[type=submit]').first().click()
  await page.waitForTimeout(9000)

  const landed = new URL(page.url()).pathname + new URL(page.url()).search
  console.log(`  signed up on Create → ${landed}`)
  check(
    !/tab=become/.test(landed),
    `it does not divert to the application form (${landed})`
  )
  check(/\/dashboard/.test(landed), 'it lands on the dashboard')

  const sides = await page.evaluate(async () => {
    const t = localStorage.getItem('mtonyo.access')
    if (!t) return null
    const r = await fetch('https://video-monetization-platform-production.up.railway.app/api/auth/me', {
      headers: { authorization: `Bearer ${t}` },
    })
    const j = await r.json()
    return { sides: j.sides, creator: Boolean(j.creator), role: j.user?.role || j.role }
  })
  console.log(`  /me → ${JSON.stringify(sides)}`)
  check(sides?.sides?.creator === true, 'the account has the Create side')
  check(sides?.sides?.viewer === false, 'and no Watch side was made behind their back')
  check(sides?.creator === true, 'and the studio profile is there')

  /* ------------------------------------------- log in on the wrong side -- */
  await signOut()
  await page.goto(`${BASE}/login?side=viewer`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForSelector('#login-id', { timeout: 40000 })
  await page.waitForTimeout(1200)
  await pickSide('viewer')
  await page.evaluate(FILL('#login-id', email))
  await page.evaluate(FILL('#login-pass', password))
  await page.locator('button[type=submit]').first().click()
  await page.waitForTimeout(6000)
  const err = (await page.locator('.form-error').first().textContent().catch(() => '')) || ''
  console.log(`  Watch login says: "${err.replace(/\s+/g, ' ').trim().slice(0, 120)}"`)
  check(/no watch account/i.test(err), 'the Watch login explains there is no Watch account')
  const offer = await page.locator('.form-error a', { hasText: /create a .* account/i }).count()
  check(offer > 0, 'and offers to create one for this email')

  /* ------------------------------------------- log in on the right side -- */
  await signOut()
  await page.goto(`${BASE}/login?side=creator`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForSelector('#login-id', { timeout: 40000 })
  await page.waitForTimeout(1200)
  await pickSide('creator')
  await page.evaluate(FILL('#login-id', email))
  await page.evaluate(FILL('#login-pass', password))
  await page.locator('button[type=submit]').first().click()
  let inside = null
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(500)
    if (!new URL(page.url()).pathname.startsWith('/login')) { inside = new URL(page.url()).pathname + new URL(page.url()).search; break }
  }
  console.log(`  Create login → ${inside}`)
  check(Boolean(inside), 'the Create login works on one submit')

  /* ------------------------------------------- add the Watch side -------- */
  await signOut()
  await page.goto(`${BASE}/signup?side=viewer`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForSelector('#signup-email', { timeout: 40000 })
  await page.waitForTimeout(1200)
  await pickSide('viewer')
  await page.evaluate(FILL('#signup-name', 'UI Side Probe'))
  await page.evaluate(FILL('#signup-phone', '0712345678')).catch(() => {})
  await page.evaluate(FILL('#signup-email', email))
  await page.evaluate(FILL('#signup-pass', password))
  for (const box of await page.locator('input[type=checkbox]').all()) {
    if (!(await box.isChecked().catch(() => true))) await box.check({ force: true }).catch(() => {})
  }
  await page.locator('button[type=submit]').first().click()
  await page.waitForTimeout(9000)

  const both = await page.evaluate(async ([e, p]) => {
    const r = await fetch('https://video-monetization-platform-production.up.railway.app/api/auth/login', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: e, password: p, side: 'viewer' }),
    })
    const j = await r.json()
    return { status: r.status, sides: j.sides }
  }, [email, password])
  console.log(`  after adding Watch → login(viewer) ${both.status}, sides ${JSON.stringify(both.sides)}`)
  check(both.status === 200, 'the Watch login works once the side is added')
  check(both.sides?.creator === true && both.sides?.viewer === true, 'and the email now holds both')

  console.log(`  account: ${email} / ${password}`)
  await browser.close()
}

console.log(fails.length ? `\n${fails.length} FAILURE(S):\n  - ${fails.join('\n  - ')}` : '\nALL PASS')
process.exit(fails.length ? 1 : 0)
