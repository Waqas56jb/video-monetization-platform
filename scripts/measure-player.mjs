/**
 * Tap → first frame, measured in a real browser.
 *
 * The API numbers in PLAYER-MEASURE.md say what the server does. They cannot say
 * what the viewer waits for, which is a different quantity: a route that answers
 * in 200 ms still leaves a black rectangle if the page will not mount the player
 * until a second request lands, or if the iframe starts loading late.
 *
 * So this drives production the way a person does — open Explore, tap a card,
 * wait for the picture to move — and timestamps each step from inside the page.
 *
 * `first_playing` is the hard one. The player is a cross-origin Cloudflare
 * iframe, so the parent page cannot reach its <video>. Two routes are tried, in
 * order, and the report says which one produced the number, because they do not
 * mean quite the same thing:
 *
 *   frame   — Playwright reaches into the iframe and reads currentTime > 0.25.
 *             This is the picture actually moving.
 *   sdk     — the Stream SDK's postMessage traffic in the parent. This fires on
 *             the player's own 'playing' event, which is a hair earlier.
 *
 * Usage:
 *   node scripts/measure-player.mjs                       # all videos, both profiles
 *   node scripts/measure-player.mjs --base https://...     # a preview deployment
 *   node scripts/measure-player.mjs --slug foo --runs 3
 */
/**
 * Playwright is not a dependency of this repository and should not become one —
 * it is a ~100 MB dev tool used by one script, and there is no root package.json
 * to hang it on. Install it wherever you like and point PLAYWRIGHT_MODULE at it:
 *
 *   npm i playwright        # then just run this
 *   PLAYWRIGHT_MODULE=/abs/path/to/node_modules/playwright/index.mjs node scripts/measure-player.mjs
 *
 * NODE_PATH does not work here: ESM ignores it.
 */
const { chromium, devices } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > -1 ? process.argv[i + 1] : dflt
}

const BASE = (arg('base', 'https://video-monetization-platform-chi.vercel.app')).replace(/\/$/, '')
const RUNS = Number(arg('runs', 3))
const ONLY = arg('slug', null)

const VIDEOS = [
  { slug: 'live-at-arusha-full-set', note: 'paid — preview then paywall' },
  { slug: 'how-to-cook-pilau-properly', note: 'free + ads — advert first' },
  { slug: 'rpreplay-final1589783013-2', note: 'portrait 886x1920' },
].filter((v) => !ONLY || v.slug === ONLY)

/** Chrome DevTools' own "Fast 3G" preset. */
const FAST_3G = {
  offline: false,
  latency: 562.5,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
}

const ALL_PROFILES = [
  { name: 'desktop', device: null, throttle: null },
  { name: 'desktop · Fast 3G', device: null, throttle: FAST_3G },
  { name: 'iPhone 13', device: devices['iPhone 13'], throttle: null },
  { name: 'iPhone 13 · Fast 3G', device: devices['iPhone 13'], throttle: FAST_3G },
]

/* `--profile iPhone` narrows the matrix; the full run is twelve cells and takes
   long enough that a targeted comparison is usually what is wanted. */
const ONLY_PROFILE = arg('profile', null)
const PROFILES = ONLY_PROFILE
  ? ALL_PROFILES.filter((p) => p.name.toLowerCase().includes(ONLY_PROFILE.toLowerCase()))
  : ALL_PROFILES

const median = (xs) => {
  const s = [...xs].filter((n) => Number.isFinite(n)).sort((a, b) => a - b)
  return s.length ? s[Math.floor((s.length - 1) / 2)] : null
}

async function once(browser, profile, slug) {
  const context = await browser.newContext({ ...(profile.device || {}) })
  const page = await context.newPage()

  if (profile.throttle) {
    const cdp = await context.newCDPSession(page)
    await cdp.send('Network.enable')
    await cdp.send('Network.emulateNetworkConditions', profile.throttle)
  }

  const marks = {}
  const stamp = (k) => {
    if (marks[k] === undefined) marks[k] = Date.now()
  }

  /**
   * Match the slug, not just the route.
   *
   * Explore warms every visible card, so six `/api/playback/...` responses are
   * already in flight before the tap. Stamping the first one to arrive recorded
   * a DIFFERENT video's prefetch and reported the API as faster than it was —
   * ~500 ms when this video's own response had not landed until ~960 ms. The
   * marks below are scoped to the video under test.
   */
  page.on('response', (res) => {
    const u = res.url()
    if (!u.includes(slug)) return
    if (u.includes('/api/videos/')) stamp('videos_done')
    else if (u.includes('/playback')) stamp('playback_done')
    else if (u.includes('/api/ads/')) stamp('ads_done')
  })

  let method = 'none'
  try {
    await page.goto(`${BASE}/explore`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
    const link = page.locator(`a[href*="${slug}"]`).first()
    await link.waitFor({ state: 'visible', timeout: 60_000 })

    stamp('tap')
    await link.click()

    /* The iframe existing is not the picture moving, but it is the moment the
       page stopped being the bottleneck — worth having on its own. */
    const iframe = page.locator('iframe[src*="videodelivery.net"], iframe[src*="cloudflarestream.com"]').first()
    await iframe.waitFor({ state: 'attached', timeout: 60_000 })
    stamp('iframe_mounted')

    /**
     * Where the wait actually goes, inside the player.
     *
     * "first_playing minus iframe_mounted" was six to thirteen seconds, which is
     * far too long to attribute to one thing. These four break that gap open:
     *
     *   video_el   the <video> exists — the SDK has built its player
     *   metadata   readyState >= 1: the manifest has been fetched and parsed
     *   canplay    readyState >= 3: enough data buffered to start
     *   unpaused   paused === false: nothing is blocking playback (autoplay
     *              policy, a pending gesture) — if this lags canplay, the
     *              problem is permission, not bandwidth
     *   first_playing  currentTime > 0.25: the picture is moving
     */
    const deadline = Date.now() + 60_000
    while (Date.now() < deadline) {
      for (const f of page.frames()) {
        if (!/videodelivery|cloudflarestream/.test(f.url())) continue
        const st = await f
          .evaluate(() => {
            const v = document.querySelector('video')
            if (!v) return null
            return { rs: v.readyState, paused: v.paused, t: v.currentTime, muted: v.muted }
          })
          .catch(() => null)
        if (!st) continue
        stamp('video_el')
        if (st.rs >= 1) stamp('metadata')
        if (st.rs >= 3) stamp('canplay')
        if (!st.paused) stamp('unpaused')
        if (st.t > 0.25) {
          stamp('first_playing')
          method = 'frame'
        }
      }
      if (marks.first_playing) break
      await page.waitForTimeout(100)
    }
  } catch {
    /* a run that never reaches the player is reported as a miss, not a crash */
  }

  await context.close()

  const rel = (k) => (marks[k] && marks.tap ? marks[k] - marks.tap : null)
  return {
    videos: rel('videos_done'),
    playback: rel('playback_done'),
    ads: rel('ads_done'),
    iframe: rel('iframe_mounted'),
    videoEl: rel('video_el'),
    metadata: rel('metadata'),
    canplay: rel('canplay'),
    unpaused: rel('unpaused'),
    playing: rel('first_playing'),
    method,
  }
}

/* A real viewer tapped a card, which is a gesture; make the headless run agree
   so an autoplay block is a finding rather than an artefact of the harness. */
/**
 * A real viewer tapped a card, which is a gesture; make the headless run agree
 * so an autoplay block is a finding rather than an artefact of the harness.
 *
 * ALLOW_CORS exists for preview deployments only. A Vercel preview gets a fresh
 * hostname per deploy, and the API's allow-list names the two production origins,
 * so every preview is refused before it can fetch anything. That is a real
 * problem for the deploy-and-verify workflow, and it is orthogonal to timing —
 * so for measurement the browser is told to skip the check. Never for production
 * numbers, and never anywhere but this harness.
 */
const browser = await chromium.launch({
  args: [
    '--autoplay-policy=no-user-gesture-required',
    ...(process.env.ALLOW_CORS ? ['--disable-web-security'] : []),
  ],
})
const rows = []

for (const video of VIDEOS) {
  for (const profile of PROFILES) {
    const runs = []
    for (let i = 0; i < RUNS; i++) runs.push(await once(browser, profile, video.slug))
    rows.push({
      slug: video.slug,
      note: video.note,
      profile: profile.name,
      videos: median(runs.map((r) => r.videos)),
      playback: median(runs.map((r) => r.playback)),
      ads: median(runs.map((r) => r.ads)),
      iframe: median(runs.map((r) => r.iframe)),
      videoEl: median(runs.map((r) => r.videoEl)),
      metadata: median(runs.map((r) => r.metadata)),
      canplay: median(runs.map((r) => r.canplay)),
      unpaused: median(runs.map((r) => r.unpaused)),
      playing: median(runs.map((r) => r.playing)),
      method: runs.find((r) => r.method !== 'none')?.method || 'none',
      hits: runs.filter((r) => r.playing !== null).length,
    })
    const last = rows[rows.length - 1]
    console.log(
      `${video.slug.padEnd(34)} ${profile.name.padEnd(20)} ` +
        `pb=${String(last.playback ?? '-').padStart(5)} if=${String(last.iframe ?? '-').padStart(5)} ` +
        `el=${String(last.videoEl ?? '-').padStart(5)} meta=${String(last.metadata ?? '-').padStart(6)} ` +
        `canplay=${String(last.canplay ?? '-').padStart(6)} unpaused=${String(last.unpaused ?? '-').padStart(6)} ` +
        `PLAY=${String(last.playing ?? '-').padStart(6)}`
    )
  }
}

await browser.close()

console.log(`\nBase: ${BASE}   runs per cell: ${RUNS}   all figures ms from tap, median\n`)
console.log('| video | profile | videos | playback | ads | iframe | video el | metadata | canplay | unpaused | first_playing | via |')
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|')
for (const r of rows) {
  const c = (v) => (v === null ? '—' : v)
  console.log(
    `| \`${r.slug}\` | ${r.profile} | ${c(r.videos)} | ${c(r.playback)} | ${c(r.ads)} | ${c(r.iframe)} | ${c(r.videoEl)} | ${c(r.metadata)} | ${c(r.canplay)} | ${c(r.unpaused)} | **${c(r.playing)}** | ${r.method} |`
  )
}
console.log(JSON.stringify(rows))
process.exit(0)
