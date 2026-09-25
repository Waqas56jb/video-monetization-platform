// B6: a shared link opened cold inside Instagram's in-app browser lands on the exact video and plays muted.
const pw = await import(process.env.PLAYWRIGHT_MODULE)
const { chromium, devices } = pw
const BASE = process.env.BASE
const IG_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/UQ1A.240205.004; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/124.0.6367.179 Mobile Safari/537.36 Instagram 330.0.0.40.92 Android (34/14; 420dpi; 1080x2400; Google/google; Pixel 7; panther; panther; en_US; 596226468)'
const b = await chromium.launch()
for (const slug of ['nyerere-day-rehearsals-awaiting-review', 'live-at-arusha-full-set', 'studio-session-track-4']) {
  const ctx = await b.newContext({ ...devices['Pixel 7'], userAgent: IG_ANDROID })
  const page = await ctx.newPage()
  const url = `${BASE}/watch/${slug}?utm_source=ig&igsh=${Date.now()}`
  const t0 = Date.now()
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 })
  let playing = null, pill = null
  while (Date.now() - t0 < 30000 && (playing == null || pill == null)) {
    for (const f of page.frames()) {
      if (!/videodelivery|cloudflarestream/.test(f.url())) continue
      const s = await f.evaluate(() => { const v = document.querySelector('video'); return v ? { t: v.currentTime, paused: v.paused, muted: v.muted } : null }).catch(() => null)
      if (s && s.t > 0.3 && !s.paused && playing == null) playing = { ...s, at: Date.now() - t0, inAd: await f.evaluate(() => false) }
    }
    if (pill == null && (await page.locator('.stream-sound').first().isVisible().catch(() => false))) pill = Date.now() - t0
    await page.waitForTimeout(150)
  }
  const adShown = await page.locator('.ad-stage').count()
  const path = new URL(page.url()).pathname
  console.log(`${slug}: landed on ${path} (${path === `/watch/${slug}` ? 'exact video' : 'WRONG PAGE'}) · first frame playing at ${playing?.at ?? '—'} ms, muted=${playing?.muted} · unmute control visible at ${pill ?? '—'} ms · advert layer present: ${adShown > 0}`)
  await page.screenshot({ path: `${process.env.AUD}/B6-${slug}.png` })
  await ctx.close()
}
await b.close()
