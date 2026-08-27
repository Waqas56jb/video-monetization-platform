/**
 * Real UI pass for the public creator page and the private studio.
 *
 *   node scripts/ui-check-creator.mjs http://localhost:5173
 *   node scripts/ui-check-creator.mjs https://video-monetization-platform-chi.vercel.app
 */
import { chromium } from 'playwright'

const BASE = (process.argv[2] || 'http://localhost:5173').replace(/\/$/, '')
const CREATOR_ID = process.argv[3] || '6e5e1784-970b-4705-aeaf-dc084cf6094b'
const EMAIL = process.env.UI_CREATOR_EMAIL || 'demo.juma@mtonyo.demo'
const PASSWORD = process.env.UI_CREATOR_PASSWORD || 'DemoPass123!'

const fail = []
const ok = []

function check(name, cond, detail = '') {
  if (cond) ok.push(name)
  else fail.push(detail ? `${name} (${detail})` : name)
}

async function visibleText(page) {
  return page.locator('body').innerText()
}

async function run() {
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
  })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  page.setDefaultTimeout(25000)

  /* ---------------- public storefront ---------------- */
  await page.goto(`${BASE}/creator/${CREATOR_ID}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('h1, .creator-hero, .state-error', { timeout: 20000 })
  await page.waitForTimeout(1200)
  const storefront = await visibleText(page)
  check('storefront loaded', /Juma/i.test(storefront), storefront.slice(0, 80))
  check('verified or name heading', await page.locator('h1').count() > 0)
  check('featured release', /Featured release/i.test(storefront))
  check('latest releases', /Latest releases/i.test(storefront))
  check('all published', /All published videos/i.test(storefront))
  check('about or bio', /About|Documentary|Live sets|coast|Arusha|Mwanza/i.test(storefront))
  check('video cards', (await page.locator('.vid-card, a.creator-featured').count()) >= 1)
  const locationOnPage = /Arusha|Dar es Salaam|Mwanza/i.test(storefront)
  check('location shown', locationOnPage)

  const featured = page.locator('a.creator-featured').first()
  if (await featured.count()) {
    await featured.click()
    await page.waitForURL(/\/watch\//, { timeout: 15000 })
    check('featured opens watch', /\/watch\//.test(page.url()))
    const profileLink = page.locator('a.creator-row').first()
    await profileLink.waitFor({ timeout: 15000 })
    const watch = await visibleText(page)
    check('watch has creator link', /View creator profile|Profile/i.test(watch))
    await profileLink.click()
    await page.waitForURL(/\/creator\//, { timeout: 15000 })
    check('watch returns to profile', /\/creator\//.test(page.url()))
  } else {
    fail.push('featured card missing so watch path skipped')
  }

  /* ---------------- signup copy ---------------- */
  await page.goto(`${BASE}/signup?side=creator`, { waitUntil: 'load' })
  const signup = await visibleText(page)
  check('signup apply CTA', /Create account & apply|APPLY/i.test(signup))
  check('signup does not promise instant studio', !/Create Creator Account/i.test(signup))

  /* ---------------- private studio ---------------- */
  await page.goto(`${BASE}/login?side=creator`, { waitUntil: 'load' })
  await page.locator('#login-id, input[name="email"], input[type="email"]').first().fill(EMAIL)
  await page.locator('#login-pass, input[name="password"], input[type="password"]').first().fill(PASSWORD)
  await page.locator('button[type="submit"]').first().click()
  await page.waitForURL(/\/dashboard/, { timeout: 20000 })
  const dash = await visibleText(page)
  check('studio dashboard', /Karibu|Available|Earnings|Views|Published/i.test(dash))
  check('nav uploads', /Uploads/i.test(dash))
  check('nav drafts', /Drafts/i.test(dash))
  check('nav published', /Published/i.test(dash))
  check('nav analytics', /Analytics/i.test(dash))
  check('nav payouts', /Revenue & Payouts|Payouts/i.test(dash))
  check('nav profile settings', /Profile settings/i.test(dash))

  const clickNav = async (label, expectText) => {
    const btn = page.locator('button.side-link', { hasText: label }).first()
    check(`nav ${label} exists`, (await btn.count()) > 0)
    if (await btn.count()) {
      await btn.click()
      await page.waitForTimeout(800)
      const text = await visibleText(page)
      check(`screen ${label}`, new RegExp(expectText, 'i').test(text), text.slice(0, 120))
    }
  }

  await clickNav('Uploads', 'Upload')
  await clickNav('Drafts', 'Draft|content|Upload')
  await clickNav('Published', 'Published|Live|content')
  await clickNav('Analytics', 'views|unlocks|Analytics')
  await clickNav('Revenue & Payouts', 'Payout|Sales|withdraw')
  await clickNav('Profile settings', 'Creator name|category|Social|photo|About')

  await browser.close()

  console.log(`UI  ${BASE}`)
  for (const n of ok) console.log(`OK   ${n}`)
  for (const n of fail) console.log(`FAIL ${n}`)
  console.log(`${ok.length} passed, ${fail.length} failed`)
  if (fail.length) process.exit(1)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
