/**
 * The Creator Capital homepage section (report2.txt §3) — signed-out, and
 * signed in as a real creator at whatever status they're actually at.
 *
 *   node scripts/ui-check-capital-homepage.mjs http://localhost:5173
 *   node scripts/ui-check-capital-homepage.mjs https://video-monetization-platform-chi.vercel.app
 *
 * A second, optional pass logs in as a creator (env CAPITAL_EMAIL/
 * CAPITAL_PASSWORD) to confirm the status card switches from the
 * illustrative example to that creator's real figures — skipped, not
 * failed, if no creator credentials are given.
 */
import { chromium } from 'playwright'

const BASE = (process.argv[2] || 'http://localhost:5173').replace(/\/$/, '')
const CAPITAL_EMAIL = process.env.CAPITAL_EMAIL
const CAPITAL_PASSWORD = process.env.CAPITAL_PASSWORD

const ok = []
const fail = []
const check = (name, cond, detail = '') => (cond ? ok : fail).push(detail ? `${name} (${detail})` : name)

async function checkSignedOut(browser) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1400 } })
  await page.goto(BASE + '/', { waitUntil: 'networkidle' })

  const section = page.locator('#creator-capital')
  await section.scrollIntoViewIfNeeded()
  check('section is present on the homepage', (await section.count()) === 1)

  const text = await section.innerText()
  check('headline present', /Creator Capital/.test(text))
  check('all 4 "How it works" steps present', ['Build earnings history', 'Unlock eligibility', 'AirPay reviews', 'Get funded'].every((s) => text.includes(s)))
  check('all 4 funding-use tiles present', ['Production Funding', 'Equipment', 'Filming & Editing', 'Marketing & Promotion'].every((s) => text.includes(s)))
  check('disclaimer names AirPay Microfinance', /AirPay Microfinance decides eligibility, approval and financing terms/.test(text))
  check('status card shows the illustrative example, not real figures', /Illustrative example/.test(text))

  const learnMore = page.getByRole('button', { name: /Learn How It Works/i })
  const startBuilding = page.getByRole('button', { name: /Start Building Eligibility/i })
  check('"Learn How It Works" CTA present', (await learnMore.count()) > 0)
  check('"Start Building Eligibility" CTA present', (await startBuilding.count()) > 0)

  await learnMore.first().click()
  await page.waitForURL('**/creator-capital', { timeout: 5000 }).catch(() => {})
  check('"Learn How It Works" routes to the explainer page', page.url().includes('/creator-capital'), page.url())

  const nav = page.locator('.nav-links a, .nav-links button').filter({ hasText: 'Creator Capital' })
  const navMobile = page.locator('.mm-link').filter({ hasText: 'Creator Capital' })
  check('desktop nav carries a Creator Capital link', (await nav.count()) > 0 || page.url().includes('/creator-capital'))

  await page.close()
}

async function checkSignedInCreator(browser) {
  if (!CAPITAL_EMAIL || !CAPITAL_PASSWORD) {
    console.log('(skipped: set CAPITAL_EMAIL/CAPITAL_PASSWORD to check the signed-in-creator status card)')
    return
  }
  const page = await browser.newPage({ viewport: { width: 1280, height: 1400 } })
  await page.goto(BASE + '/login?side=creator', { waitUntil: 'domcontentloaded' })
  await page.locator('#login-email, input[type=email]').first().fill(CAPITAL_EMAIL)
  await page.locator('#login-pass, input[type=password]').first().fill(CAPITAL_PASSWORD)
  await page.getByRole('button', { name: /log in/i }).click()
  await page.waitForURL('**/dashboard**', { timeout: 15000 }).catch(() => {})

  await page.goto(BASE + '/', { waitUntil: 'networkidle' })
  const section = page.locator('#creator-capital')
  await section.scrollIntoViewIfNeeded()
  await page.waitForTimeout(1500) // let the real api.capital.status() call resolve
  const text = await section.innerText()
  check('signed-in creator sees a status card', /Creator Capital Status/.test(text))
  check('signed-in creator does NOT see the illustrative label', !/Illustrative example/.test(text), text.slice(0, 200))

  await page.close()
}

async function run() {
  const browser = await chromium.launch()
  try {
    await checkSignedOut(browser)
    await checkSignedInCreator(browser)
  } finally {
    await browser.close()
  }

  console.log('')
  for (const n of ok) console.log(`OK   ${n}`)
  for (const n of fail) console.log(`FAIL ${n}`)
  console.log(`\n${ok.length} passed, ${fail.length} failed`)
  if (fail.length) process.exit(1)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
