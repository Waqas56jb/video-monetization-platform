/**
 * WhatsApp sharing — the functional link flow, across devices, against
 * production.
 *
 * The Milestone 2 acceptance for sharing (client, Sep 17) is deliberately
 * the part under our control: Share opens WhatsApp with the exact video
 * link, and whoever taps that link lands on the correct video with its
 * free preview. The rich card is WhatsApp's own crawl and cache and is
 * tracked separately.
 *
 * For each profile and each video this:
 *   1. opens the watch page and taps Share;
 *   2. reads the WhatsApp control's href (whatsapp://, api.whatsapp.com or
 *      wa.me — whichever the device gets) and decodes the `text` it carries;
 *   3. checks that text IS this site's /watch/<slug> link (and nothing else);
 *   4. navigates to that exact link as a fresh visitor and checks it lands on
 *      the right video: the SPA shell (not the crawler document), the real
 *      title in the tab, and the player/preview on screen.
 *
 *   PLAYWRIGHT_MODULE=file:///… node scripts/e2e/whatsapp-link-flow.mjs
 */
const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const { devices } = pw

const BASE = process.env.BASE || 'https://video-monetization-platform-chi.vercel.app'
const ONLY = process.env.ONLY || null
const VIDEOS = [
  { slug: 'ugali-samaki-sunday-cooking', title: 'Ugali & Samaki — Sunday Cooking', kind: 'free_with_ads' },
  { slug: 'live-at-arusha-full-set', title: 'Live at Arusha', kind: 'paid' },
].filter((v) => !ONLY || v.slug === ONLY)
const PROFILES = [
  { name: 'chromium desktop', engine: 'chromium', opts: { viewport: { width: 1440, height: 900 } } },
  { name: 'Pixel 7', engine: 'chromium', opts: { ...devices['Pixel 7'] } },
  { name: 'iPhone 14', engine: 'webkit', opts: { ...devices['iPhone 14'] } },
]

let failures = 0
const ok = (m) => console.log(`      ok    ${m}`)
const fail = (m) => {
  failures += 1
  console.log(`      FAIL  ${m}`)
}
const check = (c, m) => (c ? ok(m) : fail(m))

/** The link inside a WhatsApp share href, whichever scheme carried it. */
function linkInside(href) {
  if (!href) return null
  const normalised = href.replace(/^whatsapp:\/\//, 'https://whatsapp.invalid/')
  try {
    return new URL(normalised).searchParams.get('text')
  } catch {
    return null
  }
}

for (const profile of PROFILES) {
  console.log(`\n### ${profile.name}`)
  const browser = await pw[profile.engine].launch()
  for (const video of VIDEOS) {
    console.log(`\n  ${video.slug} (${video.kind})`)
    const ctx = await browser.newContext({ ...profile.opts })
    const page = await ctx.newPage()
    try {
      await page.goto(`${BASE}/watch/${video.slug}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
      const share = page.locator('button:has-text("Share")').first()
      await share.click({ timeout: 30000 })
      const wa = page.locator('a', { hasText: 'WhatsApp' }).first()
      const href = await wa.getAttribute('href', { timeout: 15000 })
      console.log(`    share href: ${href}`)
      const link = linkInside(href)
      console.log(`    link sent:  ${link}`)

      check(Boolean(href) && /^(whatsapp:\/\/send|https:\/\/(api\.whatsapp\.com|wa\.me)\/)/.test(href), 'Share hands off to WhatsApp')
      check(Boolean(link) && link.startsWith(`${BASE}/watch/${video.slug}`), 'the text WhatsApp sends is exactly this video\'s /watch link')
      check(Boolean(link) && !/\s/.test(link), 'the link carries nothing but the link')

      // 4. The recipient taps it.
      const tapper = await browser.newContext({ ...profile.opts })
      const tapped = await tapper.newPage()
      const errors = []
      tapped.on('pageerror', (e) => errors.push(String(e)))
      const response = await tapped.goto(link, { waitUntil: 'domcontentloaded', timeout: 60000 })
      check(response && response.status() === 200, `the link answers 200 (got ${response && response.status()})`)
      check((response && response.headers()['x-doc']) === 'shell', `a person gets the app shell, not the crawler document (x-doc=${response && response.headers()['x-doc']})`)
      check(new URL(tapped.url()).pathname === `/watch/${video.slug}`, `lands on /watch/${video.slug}`)
      await tapped.waitForFunction((t) => document.title.includes(t), video.title.split(' — ')[0].slice(0, 12), { timeout: 30000 }).catch(() => {})
      const title = await tapped.title()
      check(title.includes(video.title.split(' — ')[0].slice(0, 12)), `the tab names the video ("${title}")`)
      const player = await tapped.waitForSelector('.player, .stream-shell, .ad-stage', { timeout: 30000 }).catch(() => null)
      check(Boolean(player), 'the player (or its poster shell) is on screen')
      if (video.kind === 'paid') {
        /* The "Free preview · 3:37 of 8:12" flag over the player, or the
           purple unlock gate — either proves a new visitor is on the paid
           video's preview, not its full film and not a blank. */
        const flag = await tapped
          .locator('.preview-flag')
          .or(tapped.locator('.player.is-gated'))
          .or(tapped.getByText(/Free preview/i))
          .first()
          .waitFor({ state: 'visible', timeout: 30000 })
          .then(() => true)
          .catch(() => false)
        check(flag, 'a paid video shows its free preview to a new visitor')
      } else {
        const ad = await tapped.waitForSelector('.ad-stage', { timeout: 30000 }).catch(() => null)
        check(Boolean(ad) || profile.engine === 'webkit', profile.engine === 'webkit' ? 'Free + Ads: player shell present (WebKit cannot decode, so no ad assertion)' : 'a Free + Ads video starts its pre-roll for a new visitor')
      }
      check(errors.length === 0, `no page errors (${errors.length})`)
      await tapper.close()
    } catch (err) {
      fail(`${profile.name} / ${video.slug}: ${err.message.split('\n')[0]}`)
    } finally {
      await ctx.close()
    }
  }
  await browser.close()
}

console.log(`\n${failures ? `${failures} FAILED CHECK(S)` : 'ALL CHECKS PASSED'}`)
process.exit(failures ? 1 : 0)
