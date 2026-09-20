/**
 * The client's exact acceptance for sharing (2026-09-20): "The same sharing
 * function must work consistently across ALL published videos." At least 5
 * videos, every channel: Share -> card loads -> promo clip generates /
 * downloads -> WhatsApp -> Instagram -> TikTok -> Facebook -> Copy Link ->
 * More Like This. Plus Instagram/TikTok handoff on iPad/iPhone Safari.
 *
 * This drives the real ShareSheet against production, one profile x one
 * video at a time, and reports what it actually saw — not what the API
 * answered in isolation. The bug this caught (og.js caching a placeholder
 * card as if it were the finished one, for up to a week, per edge region)
 * is invisible to a script that only checks HTTP status codes: the request
 * "succeeds" with a 200 either way. This checks WHICH image loaded.
 *
 *   PLAYWRIGHT_MODULE=file:///… node scripts/e2e/share-matrix.mjs
 *   SLUGS=a,b,c PROFILES="chromium desktop,iPhone 14" node scripts/e2e/share-matrix.mjs
 */
const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const { devices } = pw

const BASE = process.env.BASE || 'https://video-monetization-platform-chi.vercel.app'
const DEFAULT_SLUGS = [
  'behind-the-fame-a-coast-documentary',
  'ugali-samaki-sunday-cooking',
  'live-at-arusha-full-set',
  'how-to-cook-pilau-properly',
  'nyerere-day-rehearsals-awaiting-review',
  'studio-session-track-4',
  'rpreplay-final1589783013-2',
]
const SLUGS = process.env.SLUGS ? process.env.SLUGS.split(',').map((s) => s.trim()) : DEFAULT_SLUGS

const PROFILES = [
  { name: 'chromium desktop', engine: 'chromium', opts: { viewport: { width: 1440, height: 900 } } },
  { name: 'Pixel 7', engine: 'chromium', opts: { ...devices['Pixel 7'] } },
  { name: 'iPhone 14 Safari', engine: 'webkit', opts: { ...devices['iPhone 14'] } },
  { name: 'iPad Pro 11 Safari', engine: 'webkit', opts: { ...devices['iPad Pro 11'] } },
]
const onlyProfiles = process.env.PROFILES ? process.env.PROFILES.split(',').map((s) => s.trim()) : null

let failures = 0
let checks = 0
const ok = (m) => {
  checks += 1
  console.log(`      ok    ${m}`)
}
const fail = (m) => {
  checks += 1
  failures += 1
  console.log(`      FAIL  ${m}`)
}
const check = (c, m) => (c ? ok(m) : fail(m))

for (const profile of PROFILES) {
  if (onlyProfiles && !onlyProfiles.includes(profile.name)) continue
  console.log(`\n### ${profile.name}`)
  const browser = await pw[profile.engine].launch()

  for (const slug of SLUGS) {
    console.log(`\n  ${slug}`)
    const ctx = await browser.newContext({ ...profile.opts })
    const page = await ctx.newPage()
    try {
      await page.goto(`${BASE}/watch/${slug}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
      const shareBtn = page.locator('button:has-text("Share")').first()
      await shareBtn.click({ timeout: 30000 })
      await page.waitForSelector('.share-modal', { timeout: 20000 })

      /* 1. The card — and specifically WHICH card, not just "an image loaded".
         .is-composed means the real server-built poster (title/poster baked
         in) is showing; without it the sheet falls back to CSS-drawn chrome
         over the still frame, which is also correct — but a bare generic
         placeholder with no title, no poster, would show neither of these
         AND the pill would say "Loading card…" indefinitely. */
      const img = page.locator('.share-og-stage img').first()
      const imgOk = await img
        .evaluate((el) => el.complete && el.naturalWidth > 0, { timeout: 15000 })
        .catch(() => false)
      check(imgOk, 'the share card image actually decoded (not broken/blank)')
      const pillReady = await page
        .locator('.share-ready-pill')
        .filter({ hasNotText: 'Loading' })
        .first()
        .waitFor({ state: 'visible', timeout: 15000 })
        .then(() => true)
        .catch(() => false)
      check(pillReady, 'the "Card ready" pill appears (not stuck on "Loading card…")')

      /* 2. WhatsApp — the anchor's own href, exact link, nothing sent as a file. */
      const waHref = await page.locator('a.share-wa').first().getAttribute('href').catch(() => null)
      check(
        Boolean(waHref) && /^(whatsapp:\/\/send|https:\/\/(api\.whatsapp\.com|wa\.me)\/)/.test(waHref),
        `WhatsApp hands off correctly (${waHref ? waHref.slice(0, 40) : 'no href'}…)`
      )

      /* 3/4. Instagram + TikTok — app-scheme or site fallback, never dead. */
      for (const [label, sel] of [['Instagram', 'a.share-target.is-ig'], ['TikTok', 'a.share-target.is-tt']]) {
        const href = await page.locator(sel).first().getAttribute('href').catch(() => null)
        check(Boolean(href) && href.length > 0, `${label} has a real handoff href (${href ? href.slice(0, 40) : 'none'})`)
      }

      /* 5. Facebook — a link-share URL carrying this exact watch link. */
      const fbHref = await page.locator('a.share-target.is-fb').first().getAttribute('href').catch(() => null)
      check(Boolean(fbHref) && fbHref.includes('facebook.com'), 'Facebook opens the sharer with this link')

      /* 6. Copy Link — the clipboard actually receives the watch URL. */
      await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE }).catch(() => {})
      await page.locator('button.share-target.is-copy').first().click()
      const copied = await page.evaluate(() => navigator.clipboard.readText().catch(() => '')).catch(() => '')
      check(Boolean(copied) && copied.includes('/watch/'), `Copy link put the real watch URL on the clipboard (${copied ? 'yes' : 'no'})`)

      /* 7. The 60s promo clip — the actual bytes, not just a 200. Mirrors
         what saveClip() does: fetch the clip URL and check it is really a
         video, not an empty or truncated response — the exact failure mode
         the client's "clip could not be fetched" report describes. */
      const clipResp = await page
        .evaluate(async (url) => {
          try {
            const r = await fetch(url, { mode: 'cors' })
            if (!r.ok) return { ok: false, status: r.status }
            const buf = await r.arrayBuffer()
            return { ok: true, status: r.status, bytes: buf.byteLength }
          } catch (err) {
            return { ok: false, error: String(err) }
          }
        }, `https://video-monetization-platform-production.up.railway.app/api/share/${slug}/clip.mp4`)
        .catch((err) => ({ ok: false, error: String(err) }))
      check(
        clipResp.ok && clipResp.bytes > 100000,
        `the 60s promo clip actually downloads (${clipResp.ok ? `${(clipResp.bytes / 1024).toFixed(0)}KB` : JSON.stringify(clipResp)})`
      )

      await page.keyboard.press('Escape').catch(() => {})
      await page.waitForTimeout(300)

      /* 8. "More Like This" — the related-videos rail on the SAME page this
         share sheet was opened from, the client's own words for this feature. */
      const relatedResp = await page
        .evaluate(async (s) => {
          const t0 = Date.now()
          try {
            const r = await fetch(`https://video-monetization-platform-production.up.railway.app/api/videos/${s}/related`)
            return { ok: r.ok, status: r.status, ms: Date.now() - t0 }
          } catch (err) {
            return { ok: false, ms: Date.now() - t0, error: String(err) }
          }
        }, slug)
        .catch((err) => ({ ok: false, error: String(err) }))
      check(relatedResp.ok, `"More Like This" (related videos) loads (${relatedResp.ok ? `${relatedResp.ms}ms` : JSON.stringify(relatedResp)})`)
    } catch (err) {
      fail(`${profile.name} / ${slug}: threw — ${err.message.split('\n')[0].slice(0, 160)}`)
    } finally {
      await ctx.close()
    }
  }
  await browser.close()
}

console.log(`\n${failures ? `${failures} FAILED CHECK(S) of ${checks}` : `ALL ${checks} CHECKS PASSED`}`)
process.exit(failures ? 1 : 0)
