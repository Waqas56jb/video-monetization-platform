/**
 * A6 / PROMPT-7 C7 — "login never works the first time, and it forgets where I was".
 *
 * Two separate claims, and they need two separate instruments.
 *
 * ONE ATTEMPT. The reported cause is autofill: Safari and Chrome paint the
 * saved email and password straight into the DOM without firing an `input`
 * event, so a controlled React form still holds two empty strings when the
 * viewer taps Log in. The first submit posts nothing, fails, and the second —
 * after a keystroke has finally synced state — works. To reproduce that here
 * the fields are filled the way autofill fills them: assign `el.value` and
 * dispatch NOTHING. `page.fill()` would be useless for this test, because it
 * dispatches the very event that is missing in the wild.
 *
 * BACK TO THE VIDEO. Started from a real `/watch/:slug` while signed out and
 * entered through the control a viewer would actually press, so the assertion
 * covers the whole route — the login URL has to carry the destination and the
 * form has to honour it. A test that navigates straight to `/login?next=…`
 * tests the half that was never broken.
 *
 *   E2E_EMAIL=… E2E_PASSWORD=… PLAYWRIGHT_MODULE=file:///… \
 *     node scripts/e2e/login-one-attempt.mjs
 *   ENTRY=header|unlock  RUNS=5  PROFILES=webkit-desktop,iphone-14
 */
const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const { devices } = pw

const BASE = process.env.BASE || 'https://video-monetization-platform-chi.vercel.app'
const SLUG = process.env.SLUG || 'how-to-cook-pilau-properly'
const RUNS = Number(process.env.RUNS || 5)
const ENTRY = process.env.ENTRY || 'header'
const EMAIL = process.env.E2E_EMAIL
const PASSWORD = process.env.E2E_PASSWORD
if (!EMAIL || !PASSWORD) { console.error('set E2E_EMAIL and E2E_PASSWORD'); process.exit(2) }

const PROFILES = [
  { name: 'webkit desktop 1440x900', engine: 'webkit', opts: { viewport: { width: 1440, height: 900 } } },
  { name: 'iPhone 14 · webkit', engine: 'webkit', opts: { ...devices['iPhone 14'] } },
]
const only = process.env.PROFILES ? process.env.PROFILES.split(',') : null

/** Autofill: the DOM value changes, no event is dispatched. */
const AUTOFILL = (email, password) => `
  (() => {
    const set = (el, v) => {
      if (!el) return false
      const proto = Object.getPrototypeOf(el)
      const d = Object.getOwnPropertyDescriptor(proto, 'value')
      d && d.set ? d.set.call(el, v) : (el.value = v)
      return true
    }
    const e = document.querySelector('input[name="email"], #login-id')
    const p = document.querySelector('input[name="password"], #login-pass')
    return set(e, ${JSON.stringify(email)}) && set(p, ${JSON.stringify(password)})
  })()
`

async function openLogin(page, profile) {
  await page.goto(`${BASE}/watch/${SLUG}`, { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForTimeout(2500)
  if (ENTRY === 'unlock') {
    const unlock = page.locator('button', { hasText: /unlock/i }).first()
    await unlock.waitFor({ state: 'visible', timeout: 20000 })
    await unlock.click()
  } else {
    const burger = page.locator('button.hamburger').first()
    if (await burger.isVisible().catch(() => false)) {
      await burger.click()
      await page.waitForTimeout(400)
      await page.locator('button', { hasText: /^\s*Log in\s*$/i }).last().click()
    } else {
      await page.locator('.nav-cta-login').first().click()
    }
  }
  await page.waitForTimeout(1500)
  return page.url()
}

const results = []
for (const profile of PROFILES) {
  if (only && !only.some((p) => profile.name.includes(p))) continue
  const browser = await pw[profile.engine].launch()
  console.log(`\n### ${profile.name}   entry=${ENTRY}`)
  for (let run = 1; run <= RUNS; run++) {
    // A brand-new context every run == a private window: no cookies, no storage,
    // no service worker carried over from the previous attempt.
    const ctx = await browser.newContext({ ...profile.opts })
    const page = await ctx.newPage()
    const row = { profile: profile.name, run, loginUrl: null, carriedNext: false, submits: 0, landed: null, ok: false, error: null }
    try {
      row.loginUrl = await openLogin(page, profile)
      row.carriedNext = /[?&]next=/.test(row.loginUrl) && decodeURIComponent(row.loginUrl).includes(`/watch/${SLUG}`)

      const filled = await page.evaluate(AUTOFILL(EMAIL, PASSWORD))
      if (!filled) throw new Error('login fields not found')

      const submit = page.locator('button[type=submit]').first()
      const t0 = Date.now()
      await submit.click()
      row.submits = 1
      // one attempt only — no retry, no second click
      let landed = null
      for (let i = 0; i < 60; i++) {
        await page.waitForTimeout(500)
        const u = new URL(page.url())
        if (!u.pathname.startsWith('/login')) { landed = u.pathname + u.search; break }
        // 500 ms, not the 30 s default: with the default this poll blocked for
        // half a minute whenever the form was clean, and the "login took 41 s"
        // it produced was the instrument, not the site.
        const err = await page.locator('.form-error[role=alert]').first().textContent({ timeout: 500 }).catch(() => null)
        if (err && err.trim()) { row.error = err.trim().slice(0, 120) }
      }
      row.ms = Date.now() - t0
      row.landed = landed
      row.ok = row.submits === 1 && !row.error && landed === `/watch/${SLUG}`
    } catch (e) {
      row.error = String(e).split('\n')[0].slice(0, 140)
    }
    await ctx.close()
    results.push(row)
    console.log(`  run ${run}  ${row.ok ? 'PASS' : 'FAIL'}  next-carried=${row.carriedNext}  submits=${row.submits}  landed=${row.landed}  ${row.ms ? row.ms + 'ms' : ''}  ${row.error ? 'err=' + row.error : ''}`)
  }
  await browser.close()
}

console.log('\n### summary')
for (const p of [...new Set(results.map((r) => r.profile))]) {
  const rows = results.filter((r) => r.profile === p)
  const pass = rows.filter((r) => r.ok).length
  const carried = rows.filter((r) => r.carriedNext).length
  console.log(`  ${p.padEnd(28)}  one-attempt+returned ${pass}/${rows.length}   next carried ${carried}/${rows.length}`)
}
const allPass = results.every((r) => r.ok)
console.log(`\n${allPass ? 'ALL PASS' : 'FAILURES PRESENT'}`)
process.exit(allPass ? 0 : 1)
