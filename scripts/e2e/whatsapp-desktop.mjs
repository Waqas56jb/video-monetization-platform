/**
 * "Tapping the WhatsApp share button does not open WhatsApp" — on a MacBook.
 *
 * Two faults were behind it and this checks both, on the engine the client uses.
 *
 *   1  the control was a <button> whose handler called
 *      `window.open(href, '_blank', 'noopener,noreferrer')` — the exact shape a
 *      popup blocker exists to stop, and Safari blocks pop-ups by default.
 *   2  what it opened was `https://web.whatsapp.com/send?…` in a TAB, never the
 *      application. To anyone not already signed in to WhatsApp Web that is a QR
 *      code page, which is indistinguishable from "nothing opened".
 *
 * HOW THE NAVIGATION IS OBSERVED. A `whatsapp://` link cannot be followed by a
 * headless browser — there is no application to hand it to — so the assertion is
 * not "WhatsApp opened" but "the browser was asked, from the anchor, in the same
 * task as the click". Playwright surfaces that as a request to an unknown
 * scheme, so the anchor's own href is read and the click is checked for having
 * navigated nothing else and opened no popup.
 *
 *   PLAYWRIGHT_MODULE=file:///… node scripts/e2e/whatsapp-desktop.mjs
 */
const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const { devices } = pw

const BASE = process.env.BASE || 'https://video-monetization-platform-chi.vercel.app'
const SLUG = process.env.SLUG || 'live-at-arusha-full-set'

const ok = (c, m) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${m}`); return Boolean(c) }
const fails = []
const check = (c, m) => { if (!ok(c, m)) fails.push(m); return Boolean(c) }

const PROFILES = [
  { name: 'webkit desktop (the MacBook)', engine: 'webkit', kind: 'desktop', opts: { viewport: { width: 1440, height: 900 } } },
  { name: 'chromium desktop (Windows)', engine: 'chromium', kind: 'desktop', opts: { viewport: { width: 1440, height: 900 } } },
  { name: 'iPhone 14 · webkit', engine: 'webkit', kind: 'phone', opts: { ...devices['iPhone 14'] } },
  {
    name: 'iPad Pro 11 · webkit',
    engine: 'webkit',
    kind: 'ipad',
    opts: { ...devices['iPad Pro 11'], hasTouch: true, isMobile: false },
  },
]
const only = process.env.PROFILES ? process.env.PROFILES.split(',').map((s) => s.trim()) : null

async function openSheet(page) {
  await page.goto(`${BASE}/watch/${SLUG}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
  await page.waitForTimeout(6000)
  await page.locator('button', { hasText: /share/i }).first().click()
  await page.locator('.share-modal').first().waitFor({ state: 'visible', timeout: 40000 })
  await page.waitForTimeout(1500)
}

for (const profile of PROFILES) {
  if (only && !only.includes(profile.name)) continue
  console.log(`\n### ${profile.name}`)
  const browser = await pw[profile.engine].launch()
  const ctx = await browser.newContext({ ...profile.opts })
  const page = await ctx.newPage()

  const newTabs = []
  ctx.on('page', (p) => newTabs.push(p.url() || '(about:blank)'))

  await openSheet(page)

  const wa = page.locator('.share-wa').first()
  const tag = await wa.evaluate((el) => el.tagName.toLowerCase())
  const href = await wa.getAttribute('href')
  const target = await wa.getAttribute('target')
  console.log(`  <${tag}> target=${target} href=${(href || '(none)').slice(0, 72)}`)

  /* 1 — a real anchor with a real href, at render time. */
  check(tag === 'a', 'the control is an anchor, not a button')
  check(Boolean(href), 'it carries an href before anything is clicked')

  /* 2 — the right destination for this kind of device. */
  if (profile.kind === 'ipad') {
    check(
      String(href).startsWith('https://web.whatsapp.com/send?text='),
      'the iPad keeps WhatsApp Web, unchanged'
    )
    check(target === '_blank', 'in a new tab')
  } else {
    check(
      String(href).startsWith('whatsapp://send?text='),
      `${profile.kind === 'phone' ? 'the phone' : 'the laptop'} opens the WhatsApp APP`
    )
    check(target === '_self', 'handing the scheme to the operating system, keeping this page')
  }
  const encoded = encodeURIComponent(`${BASE}/watch/${SLUG}`)
  check(
    decodeURIComponent(String(href)).includes(`/watch/${SLUG}`),
    'and the message is the watch URL'
  )

  /* 3 — no popup, and nothing async between the gesture and the navigation. */
  const openedBefore = newTabs.length
  const urlBefore = page.url()
  let opened = null
  await page.evaluate(() => {
    window.__openCalls = 0
    const real = window.open
    window.open = function (...a) { window.__openCalls += 1; return real.apply(window, a) }
  })
  await wa.click({ timeout: 15000 }).catch((e) => { opened = String(e).split('\n')[0] })
  await page.waitForTimeout(2500)
  const openCalls = await page.evaluate(() => window.__openCalls)
  check(openCalls === 0, `the click opens no window itself (window.open called ${openCalls}×)`)
  if (profile.kind === 'ipad') {
    check(newTabs.length > openedBefore, 'the iPad still gets its tab')
  } else {
    check(
      newTabs.length === openedBefore,
      'no popup is created — the scheme goes straight to the OS'
    )
    check(page.url() === urlBefore, 'and the watch page is not navigated away')
  }

  /* 4 — the visible fallback, desktop only. */
  if (profile.kind === 'desktop') {
    const fb = page.locator('.share-wa-web').first()
    const shown = await fb.waitFor({ state: 'visible', timeout: 4000 }).then(() => true).catch(() => false)
    check(shown, 'with no app to take the scheme, a fallback link appears within 4 s')
    if (shown) {
      const fh = await fb.getAttribute('href')
      console.log(`  fallback: "${(await fb.textContent())?.trim()}" → ${String(fh).slice(0, 60)}`)
      check(String(fh).startsWith('https://web.whatsapp.com/send?text='), 'pointing at WhatsApp Web')
      check(decodeURIComponent(String(fh)).includes(`/watch/${SLUG}`), 'carrying the same watch URL')
      check((await fb.getAttribute('target')) === '_blank', 'in a new tab')
    }
  } else {
    const fb = await page.locator('.share-wa-web').count()
    check(fb === 0, 'no desktop fallback link on a touch device')
  }

  /* 5 — the escape hatch is still beside it. */
  const copy = await page.locator('.share-modal button, .share-modal a').filter({ hasText: /copy/i }).count()
  check(copy > 0, 'Copy link is still offered next to it')

  await browser.close()
}

console.log(fails.length ? `\n${fails.length} FAILURE(S):\n  - ${fails.join('\n  - ')}` : '\nALL PASS')
process.exit(fails.length ? 1 : 0)
