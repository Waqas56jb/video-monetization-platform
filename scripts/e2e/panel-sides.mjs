/**
 * Do the two panels show the right tools to the two kinds of account?
 *
 * Watch and Create are separate accounts on one email. A Create-only account
 * should see the studio and no Watch tools; a Watch-only account the reverse;
 * and each should be offered the side it does not have, because adding it is now
 * a thing a person can do for themselves.
 *
 * Two of this file's own assertions were wrong before the panel was: it looked
 * for an "Earnings" item (the studio calls it "Revenue & Payouts") and for "My
 * Videos" (it is "Drafts" and "Published"). Both reported a working panel as
 * broken. Assert the labels that exist.
 *
 * Give it a Create-ONLY account. An account that has since added the Watch side
 * legitimately shows both, and testing the rule against it proves nothing.
 *
 *   CREATOR_EMAIL=… CREATOR_PASS=… VIEWER_EMAIL=… VIEWER_PASS=…  *     PLAYWRIGHT_MODULE=file:///… node scripts/e2e/panel-sides.mjs
 */
const pw = await import(process.env.PLAYWRIGHT_MODULE)
const BASE = 'https://video-monetization-platform-chi.vercel.app'
const ok = (c, m) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${m}`); return Boolean(c) }
const fails = []
const check = (c, m) => { if (!ok(c, m)) fails.push(m); return Boolean(c) }
const FILL = (sel, v) => `(() => { const el=document.querySelector(${JSON.stringify(sel)}); if(!el) return false;
  const d=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),'value'); d.set.call(el,${JSON.stringify(v)});
  el.dispatchEvent(new Event('input',{bubbles:true})); return true })()`

const ACCOUNTS = [
  ['a Create account', process.env.CREATOR_EMAIL, process.env.CREATOR_PASS, 'creator'],
  ['a Watch account', process.env.VIEWER_EMAIL, process.env.VIEWER_PASS, 'viewer'],
]
const b = await pw.chromium.launch()
for (const [label, email, password, side] of ACCOUNTS) {
  console.log(`\n### ${label} (${email})`)
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/login?side=${side}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForSelector('#login-id', { timeout: 40000 })
  await page.waitForTimeout(1200)
  const toggle = page.locator('.role-toggle button', { hasText: side === 'creator' ? /create/i : /watch/i }).first()
  if (await toggle.count()) await toggle.click()
  await page.waitForTimeout(400)
  await page.evaluate(FILL('#login-id', email))
  await page.evaluate(FILL('#login-pass', password))
  await page.locator('button[type=submit]').first().click()
  for (let i = 0; i < 60; i++) { await page.waitForTimeout(500); if (!new URL(page.url()).pathname.startsWith('/login')) break }
  await page.waitForTimeout(6000)
  console.log(`  landed on ${new URL(page.url()).pathname + new URL(page.url()).search}`)
  const tabs = (await page.locator('.dash-nav a, .dash-nav button, .sidebar a, .sidebar button, nav a').allTextContents())
    .map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean)
  console.log(`  panel items: ${[...new Set(tabs)].join(' · ').slice(0, 220)}`)
  const has = (re) => tabs.some((t) => re.test(t))
  if (side === 'creator') {
    check(has(/upload/i), 'the studio offers Upload')
    /* The studio lists videos as "Drafts" and "Published"; there is no item
       called "My Videos", and asserting one reported the panel as broken. */
    check(has(/drafts/i) && has(/published/i), 'and Drafts and Published')
    /* The studio calls it "Revenue & Payouts", not "Earnings" — the first
       version of this check asserted a label that does not exist and reported
       the panel as broken. */
    check(has(/revenue|payout|earnings/i), 'and Revenue & Payouts')
    check(!has(/my library|my purchases/i), 'and NOT the Watch account tools it does not have')
    check(has(/add a watch account/i), 'and it offers to add the Watch side')
  } else {
    check(has(/librar/i), 'the viewer panel offers My Library')
    check(!has(/upload/i), 'and does not offer Upload')
    check(!has(/revenue|payout|earnings/i), 'and does not offer Revenue & Payouts')
    check(has(/add a creator account|apply to become/i), 'and it offers a way onto the Create side')
  }
  await ctx.close()
}
await b.close()
console.log(fails.length ? `\n${fails.length} FAILURE(S):\n  - ${fails.join('\n  - ')}` : '\nALL PASS')
process.exit(fails.length ? 1 : 0)
