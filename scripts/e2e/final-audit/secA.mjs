// Section A browser probe — production. PART=timing|aspect|progress|label|ads|all
const pw = await import(process.env.PLAYWRIGHT_MODULE)
const { chromium, devices } = pw
const BASE = process.env.BASE, API = process.env.API
const PART = process.env.PART || 'all'
const RUNS = Number(process.env.RUNS || 5)
const out = (...a) => console.log(...a)
const median = (a) => { const s = a.filter((x) => x != null).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null }

const login = async (email, password) => (await (await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password, side: 'viewer' }) })).json()).session

const browser = await chromium.launch()

async function newPage(profile, session) {
  const opts = profile.startsWith('pixel') ? { ...devices['Pixel 7'] } : { viewport: { width: 1440, height: 900 } }
  const ctx = await browser.newContext(opts)
  const page = await ctx.newPage()
  if (profile === 'pixel') {
    const cdp = await ctx.newCDPSession(page)
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    await cdp.send('Network.enable')
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 })
  }
  if (session) {
    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 90000 })
    await page.evaluate((s) => { localStorage.setItem('mtonyo.access', s.accessToken); if (s.refreshToken) localStorage.setItem('mtonyo.refresh', s.refreshToken) }, session)
  }
  return { ctx, page }
}

async function frameVideo(page) {
  for (const f of page.frames()) {
    if (!/videodelivery|cloudflarestream/.test(f.url())) continue
    const s = await f.evaluate(() => { const v = document.querySelector('video'); return v ? { t: v.currentTime, paused: v.paused } : null }).catch(() => null)
    if (s && s.t > 0.2 && !s.paused) return s
  }
  return null
}

/* ---------------- A1 / A10: tap -> poster, tap -> playing ---------------- */
if (PART === 'timing' || PART === 'all') {
  const fixture = await login(process.env.E2E_EMAIL, process.env.E2E_PASSWORD)
  const VIDEOS = [
    { slug: 'live-at-arusha-full-set', label: 'owned paid film (signed in)', session: fixture },
    { slug: 'behind-the-fame-a-coast-documentary', label: 'paid preview (signed out)', session: null },
    { slug: 'ugali-samaki-sunday-cooking', label: 'free+ads, first frame = the advert (signed out)', session: null },
  ]
  for (const profile of ['desktop', 'pixel']) {
    for (const v of VIDEOS.filter((x) => !process.env.ONLY || x.slug === process.env.ONLY)) {
      const posters = [], plays = []
      for (let i = 0; i < RUNS; i++) {
        const { ctx, page } = await newPage(profile, v.session)
        try {
          await page.goto(`${BASE}/explore`, { waitUntil: 'domcontentloaded', timeout: 90000 })
          const card = page.locator(`a[href$="/watch/${v.slug}"]`).first()
          await card.waitFor({ state: 'attached', timeout: 60000 })
          await card.scrollIntoViewIfNeeded().catch(() => {})
          await page.waitForTimeout(800)
          const t0 = Date.now()
          await card.click({ timeout: 20000 })
          let tPoster = null, tPlay = null
          while (Date.now() - t0 < 45000 && tPlay == null) {
            if (tPoster == null) {
              const p = await page.evaluate(() => {
                const imgs = [...document.querySelectorAll('img.stream-poster, .watch-skeleton img, .player-poster img, .ws-poster img')]
                return imgs.some((i) => i.complete && i.naturalWidth > 0 && i.getBoundingClientRect().width > 50)
              }).catch(() => false)
              if (p) tPoster = Date.now() - t0
            }
            if (await frameVideo(page)) tPlay = Date.now() - t0
            else await page.waitForTimeout(100)
          }
          posters.push(tPoster); plays.push(tPlay)
          out(`  ${profile.padEnd(7)} ${v.slug.padEnd(38)} run ${i + 1}: poster ${tPoster ?? '—'} ms, playing ${tPlay ?? '—'} ms`)
        } catch (e) {
          out(`  ${profile} ${v.slug} run ${i + 1}: threw ${String(e.message).split('\n')[0]}`)
          posters.push(null); plays.push(null)
        } finally { await ctx.close() }
      }
      out(`MEDIAN ${profile.padEnd(7)} ${v.label.padEnd(48)} poster ${median(posters)} ms · playing ${median(plays)} ms · (${plays.filter((x) => x != null).length}/${RUNS} reached playing)`)
    }
  }
}

/* ---------------- A4: portrait aspect ---------------- */
if (PART === 'aspect' || PART === 'all') {
  for (const profile of ['desktop', 'pixel']) {
    const { ctx, page } = await newPage(profile === 'pixel' ? 'pixel-nothrottle' : 'desktop')
    if (profile === 'pixel') await page.setViewportSize(devices['Pixel 7'].viewport)
    await page.goto(`${BASE}/watch/rpreplay-final1589783013-2`, { waitUntil: 'domcontentloaded', timeout: 90000 })
    await page.waitForSelector('.stream-shell, .stream-frame', { timeout: 60000 })
    await page.waitForTimeout(4000)
    const box = await page.evaluate(() => {
      const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) } }
      return { shell: r('.stream-shell'), frame: r('.stream-frame'), vw: innerWidth, vh: innerHeight }
    })
    const ratio = box.frame ? (box.frame.w / box.frame.h).toFixed(3) : null
    out(`A4 ${profile}: source 886x1920 (w/h 0.461) · frame ${box.frame?.w}x${box.frame?.h} (w/h ${ratio}) · shell ${box.shell?.w}x${box.shell?.h} · viewport ${box.vw}x${box.vh}`)
    await page.screenshot({ path: `${process.env.AUD}/A4-portrait-${profile}.png` })
    await ctx.close()
  }
}

/* ---------------- A5: top progress bar clears ---------------- */
if (PART === 'progress' || PART === 'all') {
  const { ctx, page } = await newPage('desktop')
  const steps = [
    ['goto', '/'], ['click', 'a[href="/explore"]'], ['click', 'a[href*="/watch/"]'], ['back'], ['click', 'a[href*="/watch/"] >> nth=1'], ['goto', '/creator-capital'], ['click', 'a[href="/"]'],
  ]
  for (const [kind, arg] of steps) {
    try {
      if (kind === 'goto') await page.goto(`${BASE}${arg}`, { waitUntil: 'domcontentloaded', timeout: 90000 })
      else if (kind === 'back') await page.goBack()
      else await page.locator(arg).first().click({ timeout: 20000 })
    } catch (e) { out(`A5 step ${kind} ${arg ?? ''}: ${String(e.message).split('\n')[0]}`) }
    await page.waitForTimeout(5000)
    const bars = await page.locator('.top-progress').count()
    out(`A5 after ${kind} ${arg ?? ''} -> ${new URL(page.url()).pathname}: top-progress elements after 5s = ${bars}`)
  }
  await page.screenshot({ path: `${process.env.AUD}/A5-after-nav.png` })
  await ctx.close()
}

/* ---------------- A6: displayed label vs server cutoff ---------------- */
if (PART === 'label' || PART === 'all') {
  for (const slug of ['live-at-arusha-full-set', 'rpreplay-final1589783013-2', 'nyerere-day-rehearsals-awaiting-review']) {
    const { ctx, page } = await newPage('desktop')
    const api = await (await fetch(`${API}/api/playback/${slug}/playback`)).json()
    await page.goto(`${BASE}/watch/${slug}`, { waitUntil: 'domcontentloaded', timeout: 90000 })
    await page.waitForSelector('.unlock-bar .ub-text', { timeout: 60000 }).catch(() => {})
    const label = (await page.locator('.unlock-bar .ub-text').first().innerText().catch(() => '')).replace(/\s+/g, ' ')
    const s = api.playback?.stopsAtSeconds
    const mmss = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
    out(`A6 ${slug}: server stopsAtSeconds=${s} (${mmss}) · on-screen: "${label}" · label matches: ${label.includes(`${mmss} free preview`)}`)
    await ctx.close()
  }
}

/* ---------------- A7: free+ads countdown only after real airtime ---------------- */
if (PART === 'ads' || PART === 'all') {
  for (const profile of ['desktop', 'pixel']) {
    const { ctx, page } = await newPage(profile)
    const t0 = Date.now()
    await page.goto(`${BASE}/watch/ugali-samaki-sunday-cooking`, { waitUntil: 'domcontentloaded', timeout: 90000 })
    const rows = []
    let firstAir = null, firstCountdown = null, blankTicks = 0, countdownBeforeAir = 0, ticks = 0
    while (Date.now() - t0 < 30000) {
      const dom = await page.evaluate(() => {
        const stage = document.querySelector('.ad-stage')
        const skip = document.querySelector('.ad-skip')
        const note = document.querySelector('.ad-loading-note')
        const poster = [...document.querySelectorAll('img.stream-poster')].some((i) => i.complete && i.naturalWidth > 0 && !i.classList.contains('is-hidden'))
        const painted = !!document.querySelector('.stream-frame.is-painted')
        const skeleton = !!document.querySelector('.watch-skeleton, .skeleton, [aria-busy="true"]')
        return { state: stage?.dataset.adState ?? null, skip: skip && !skip.hidden ? skip.innerText.trim() : null, note: note?.innerText ?? null, poster, painted, skeleton }
      }).catch(() => ({}))
      let adAir = null
      for (const f of page.frames()) {
        if (!/videodelivery|cloudflarestream/.test(f.url())) continue
        const s = await f.evaluate(() => { const v = document.querySelector('video'); return v ? v.currentTime : null }).catch(() => null)
        if (s != null) adAir = Math.max(adAir ?? 0, s)
      }
      const at = Date.now() - t0
      ticks++
      const somethingShown = dom.note || dom.poster || dom.painted || dom.skeleton || dom.skip
      if (!somethingShown) blankTicks++
      if (adAir > 0 && firstAir == null) firstAir = at
      if (dom.skip && /Skip in/.test(dom.skip) && firstCountdown == null) firstCountdown = at
      if (dom.skip && /Skip in/.test(dom.skip) && !(adAir > 0)) countdownBeforeAir++
      const sig = JSON.stringify([dom.state, dom.skip, dom.note, dom.poster, dom.painted, !!somethingShown])
      if (rows.at(-1)?.sig !== sig) rows.push({ at, sig, adAir })
      if (dom.skip === 'Skip ad' || (dom.state == null && firstAir != null)) break
      await page.waitForTimeout(150)
    }
    out(`A7 ${profile}: ${ticks} samples @150ms · first ad airtime at ${firstAir} ms · first "Skip in" at ${firstCountdown} ms · samples with countdown before airtime: ${countdownBeforeAir} · samples with nothing on screen: ${blankTicks}`)
    for (const r of rows) out(`     ${String(r.at).padStart(6)}ms  [state, skip, note, poster, painted, shown]=${r.sig}  adTime=${r.adAir?.toFixed?.(2) ?? '—'}`)
    await ctx.close()
  }
}

await browser.close()
