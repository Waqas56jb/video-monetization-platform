/**
 * Free + Ads player journey.
 *
 *   node scripts/ui-check-ads.mjs http://localhost:5173
 *   node scripts/ui-check-ads.mjs https://video-monetization-platform-chi.vercel.app
 *
 * Must run signed-out. Admin / the video's creator never see the preroll.
 */
import { chromium } from 'playwright'

const BASE = (process.argv[2] || 'http://localhost:5173').replace(/\/$/, '')
const SLUG = process.argv[3] || 'how-to-cook-pilau-properly'

const fail = []
const ok = []

function check(name, cond, detail = '') {
  if (cond) ok.push(name)
  else fail.push(detail ? `${name} (${detail})` : name)
}

async function run() {
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required'],
  })
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  page.setDefaultTimeout(40000)
  await page.addInitScript(() => {
    try {
      localStorage.clear()
      sessionStorage.clear()
    } catch {
      /* private mode */
    }
  })

  const errors = []
  page.on('pageerror', (err) => errors.push(String(err)))

  await page.goto(`${BASE}/watch/${SLUG}`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.player, .state-error, .player-empty, .ad-stage', { timeout: 25000 })

  const bodyText = await page.locator('body').innerText()
  check('watch page loaded', /pilau|cook|free \+ ads/i.test(bodyText), bodyText.slice(0, 80))

  const empty = page.locator('.player-empty')
  const emptyCount = await empty.count()
  check('player did not fail to start', emptyCount === 0, emptyCount ? await empty.textContent() : '')

  const adStage = page.locator('.ad-stage')
  try {
    await adStage.waitFor({ state: 'attached', timeout: 15000 })
  } catch {
    const html = (await page.locator('.player').innerHTML().catch(() => '')).slice(0, 600)
    const text = (await page.locator('body').innerText()).slice(0, 400)
    console.log('NO AD STAGE')
    console.log('player html', html)
    console.log('text', text)
  }
  const adBox =
    (await adStage.count()) > 0 ? (await adStage.boundingBox().catch(() => null)) : { width: 0, height: 0 }
  check('preroll stage appeared', (await adStage.count()) > 0)
  if (await adStage.count()) {
    check('preroll stage has a real frame (not a collapsed black box)', adBox.height >= 120, `h=${adBox.height}`)
  }

  if (await adStage.count()) {
    const state0 = await adStage.getAttribute('data-ad-state')
    check('skip clock not ready on black screen', state0 !== 'skippable', `state=${state0}`)
    const tap = page.locator('.ad-stage .stream-tap')
    if (await tap.count()) await tap.click({ force: true }).catch(() => {})
    await page.waitForTimeout(800)

    const skipReady0 = page.locator('.ad-skip.is-ready')
    check('Skip is not available before airtime', (await skipReady0.count()) === 0)

    const loadingNote = page.locator('.ad-loading-note')
    const earlySkip = page.locator('.ad-skip')
    if ((await loadingNote.count()) > 0) {
      check('loading copy while waiting for frames', /loading/i.test((await loadingNote.textContent()) || ''))
      check('Skip hidden while loading', (await earlySkip.count()) === 0 || (await earlySkip.isHidden()))
    }

    await page.waitForFunction(
      () => {
        const el = document.querySelector('.ad-stage')
        return el && el.getAttribute('data-ad-state') !== 'loading'
      },
      { timeout: 20000 }
    ).catch(() => {})

    const statePlay = await adStage.getAttribute('data-ad-state')
    check(
      'ad airtime started (not stuck on loading/black)',
      statePlay === 'playing' || statePlay === 'skippable',
      `state=${statePlay}`
    )

    const skipBtn = page.locator('.ad-skip')
    const skipText = async () =>
      (await skipBtn.count()) > 0 ? ((await skipBtn.textContent()) || '').trim() : ''

    if (statePlay === 'playing') {
      const skipLabel = await skipText()
      check('countdown only after airtime', /^Skip in \d+/.test(skipLabel), skipLabel)
      check('Skip not yet clickable during countdown', (await page.locator('.ad-skip.is-ready').count()) === 0)
      await page.waitForTimeout(2000)
      const skipLabel2 = await skipText()
      const moved = skipLabel !== skipLabel2 || /Skip ad/i.test(skipLabel2)
      check('skip countdown advances with real playback', moved, `${skipLabel} → ${skipLabel2}`)
    }

    await page.waitForFunction(
      () => {
        const el = document.querySelector('.ad-stage')
        if (!el) return true
        return el.getAttribute('data-ad-state') === 'skippable'
      },
      { timeout: 20000 }
    ).catch(() => {})

    const skipReady = page.locator('.ad-skip.is-ready')
    if (await skipReady.count()) {
      check('Skip becomes available after delay', true)
      await skipReady.click()
    } else if ((await adStage.count()) === 0) {
      check('ad finished on its own and handed off to content', true)
    } else {
      fail.push(`Skip never became ready (state=${await adStage.getAttribute('data-ad-state')})`)
    }
  }

  await page.waitForTimeout(800)
  const contentTap = page.locator('.player .stream-tap')
  if (await contentTap.count()) await contentTap.click({ force: true }).catch(() => {})
  await page.waitForSelector('.player .stream-shell.is-ready', { timeout: 15000 }).catch(() => {})

  const adGone = (await page.locator('.ad-stage').count()) === 0
  const contentFrame = page.locator('.player iframe.stream-frame, .player .stream-shell')
  check('ad stage closed', adGone)
  check('content player is on screen', (await contentFrame.count()) > 0)
  check(
    'content actually started (not a paused Play overlay)',
    (await page.locator('.player .stream-shell.is-ready').count()) > 0
  )
  check('no page crash', errors.length === 0, errors.slice(0, 2).join(' | '))

  await browser.close()

  console.log(`UI  ${BASE}/watch/${SLUG}`)
  for (const n of ok) console.log(`OK   ${n}`)
  for (const n of fail) console.log(`FAIL ${n}`)
  console.log(`${ok.length} passed, ${fail.length} failed`)
  if (fail.length) process.exit(1)
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
