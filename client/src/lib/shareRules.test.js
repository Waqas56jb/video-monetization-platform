import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  canonicalWatchPath,
  canonicalWatchUrl,
  shareWatchUrl,
  nativeShareData,
  videoRouteMatches,
  playbackRouteMatches,
  whatsappShareText,
} from './watchUrl.js'
import {
  whatsappHref,
  whatsappNeedsVisibleFallback,
  whatsappTarget,
  whatsappWebHref,
} from './whatsappShare.js'
import { authUrl, safeNext } from './nextPath.js'
import { adCanSkip, adSkipRules } from './adSkip.js'

const ORIGIN = 'https://video-monetization-platform-chi.vercel.app'

test('canonical URL is /watch/{slug} on the public origin', () => {
  const video = { slug: 'studio-session-track-4', id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' }
  assert.equal(canonicalWatchPath(video), '/watch/studio-session-track-4')
  assert.equal(
    canonicalWatchUrl(video, ORIGIN),
    `${ORIGIN}/watch/studio-session-track-4`
  )
  assert.equal(canonicalWatchPath({ id: video.id }), null)
})

test('route match accepts slug or id and rejects stale rows', () => {
  const video = { slug: 'studio-session-track-4', id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' }
  assert.equal(videoRouteMatches('studio-session-track-4', video), true)
  assert.equal(videoRouteMatches(video.id, video), true)
  assert.equal(videoRouteMatches('other-title', video), false)
})

test('a purchase of video A never matches playback for video B', () => {
  const a = { id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' }
  const b = { id: 'bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee' }
  assert.equal(playbackRouteMatches({ videoId: a.id, access: { canWatchFull: true } }, a), true)
  assert.equal(playbackRouteMatches({ videoId: a.id, access: { canWatchFull: true } }, b), false)
  assert.equal(playbackRouteMatches({ videoId: a.id }, null), false)
  assert.equal(playbackRouteMatches(null, a), false)
})

test('share URL adds cache-busting ?s= when sourceKey is set', () => {
  const video = { slug: 'studio-session-track-4' }
  assert.equal(
    shareWatchUrl(video, ORIGIN, 'abc123'),
    `${ORIGIN}/watch/studio-session-track-4?s=abc123`
  )
  assert.equal(canonicalWatchUrl(video, ORIGIN), `${ORIGIN}/watch/studio-session-track-4`)
})

test('WhatsApp payload is the share URL only — OG card supplies title and poster', () => {
  const url = `${ORIGIN}/watch/behind-the-fame-a-coast-documentary?s=abc`
  const text = whatsappShareText(url)
  assert.equal(text, url)
  assert.equal(text.endsWith('.mp4'), false)
})

/** Pretend to be a device for the length of one assertion. */
function asDevice(navigatorLike, run) {
  const had = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  Object.defineProperty(globalThis, 'navigator', {
    value: navigatorLike,
    configurable: true,
    writable: true,
  })
  try {
    run()
  } finally {
    if (had) Object.defineProperty(globalThis, 'navigator', had)
    else delete globalThis.navigator
  }
}

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'
const IPAD_AS_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
const MAC = IPAD_AS_MAC

test('WhatsApp never goes through api.whatsapp.com', () => {
  // That URL loads a marketing page rather than the app, and is what produced
  // the client's iPad report: "Something went wrong. The application couldn't
  // be opened." The previous version of this test asserted it, so the suite
  // was defending the bug.
  const url = `${ORIGIN}/watch/studio-session-track-4`
  for (const nav of [
    { userAgent: IPHONE, platform: 'iPhone', maxTouchPoints: 5 },
    { userAgent: IPAD_AS_MAC, platform: 'MacIntel', maxTouchPoints: 5 },
    { userAgent: MAC, platform: 'MacIntel', maxTouchPoints: 0 },
  ]) {
    asDevice(nav, () => {
      assert.doesNotMatch(whatsappHref(url), /api\.whatsapp\.com/)
    })
  }
})

test('a phone and a laptop both open the APP; only the iPad takes the web URL', () => {
  const url = `${ORIGIN}/watch/studio-session-track-4`

  asDevice({ userAgent: IPHONE, platform: 'iPhone', maxTouchPoints: 5 }, () => {
    assert.equal(whatsappHref(url).startsWith('whatsapp://send?text='), true)
    assert.equal(whatsappTarget(), '_self')
    // A phone is redirected on to WhatsApp Web by itself, so it needs no link.
    assert.equal(whatsappNeedsVisibleFallback(), false)
  })

  // iPadOS reports itself as a Mac; only maxTouchPoints gives it away. There is
  // no desktop WhatsApp app on iPadOS to hand off to, so it takes the web URL —
  // in a new tab, rather than navigating the watch page away.
  asDevice({ userAgent: IPAD_AS_MAC, platform: 'MacIntel', maxTouchPoints: 5 }, () => {
    assert.equal(whatsappHref(url).startsWith('https://web.whatsapp.com/send?text='), true)
    assert.equal(whatsappTarget(), '_blank')
    assert.equal(whatsappNeedsVisibleFallback(), false)
  })

  /**
   * THE MACBOOK. This used to be `https://web.whatsapp.com/send?…` in a new tab,
   * and that is the whole of the client's "tapping WhatsApp does not open
   * WhatsApp": a browser tab opened on WhatsApp Web, which to anyone not already
   * signed in there is a QR code page. Nothing that looks like WhatsApp opened
   * because nothing ever asked for the app. macOS and Windows both register the
   * `whatsapp://` scheme.
   */
  asDevice({ userAgent: MAC, platform: 'MacIntel', maxTouchPoints: 0 }, () => {
    assert.equal(whatsappHref(url), `whatsapp://send?text=${encodeURIComponent(url)}`)
    assert.equal(whatsappTarget(), '_self')
    // And because whatsapp:// fails silently with no app, it must be able to say so.
    assert.equal(whatsappNeedsVisibleFallback(), true)
    assert.equal(whatsappWebHref(url), `https://web.whatsapp.com/send?text=${encodeURIComponent(url)}`)
  })
})

/**
 * The navigation has to be the anchor's own.
 *
 * It was a `<button>` calling `window.open(href, '_blank', 'noopener,noreferrer')`
 * — the exact shape a popup blocker exists to stop, and Safari blocks pop-ups by
 * default. An href on a real anchor is never blocked, and it cannot be blocked
 * by anything the click handler does either, because the handler no longer
 * navigates at all.
 */
test('the WhatsApp control navigates by href, not by window.open', () => {
  /* URL-relative: this file imports no path helpers, and adding two just to
     reach a sibling file is more machinery than the read is worth. */
  const src = readFileSync(new URL('../components/watch/ShareSheet.jsx', import.meta.url), 'utf8')
  const block = src.slice(src.indexOf('className="share-wa"'), src.indexOf('share-targets'))
  assert.match(block, /href=\{whatsappHref\(shareUrl\)\}/, 'the href is computed at render')
  assert.match(block, /target=\{whatsappTarget\(\)\}/)
  assert.doesNotMatch(block, /window\.open/, 'nothing here may open a window')
  assert.doesNotMatch(block, /<button[^>]*className="share-wa"/, 'it is an anchor')

  // And no await between the gesture and the navigation.
  const handler = src.slice(src.indexOf('const onWhatsApp = () =>'), src.indexOf('const onFacebook'))
  assert.doesNotMatch(handler, /await /, 'nothing may be awaited inside the click handler')
  assert.doesNotMatch(handler, /window\.location\.href =/, 'the anchor navigates, not the handler')
})

test('the WhatsApp payload is the watch URL and nothing else', () => {
  // A caption before the link pushes the URL out of WhatsApp's first-link
  // detection, and it then sends a paragraph plus a tiny site icon instead of
  // the poster card.
  const url = `${ORIGIN}/watch/studio-session-track-4?s=abc`
  asDevice({ userAgent: IPHONE, platform: 'iPhone', maxTouchPoints: 5 }, () => {
    const href = whatsappHref(url)
    assert.equal(href, `whatsapp://send?text=${encodeURIComponent(url)}`)
    assert.equal(href.includes('.mp4'), false)
  })
})

test('socialShare no longer exports a WhatsApp URL for anyone to pick by mistake', async () => {
  const socialShare = await import('./socialShare.js')
  assert.equal('whatsappHref' in socialShare, false)
  // The helpers other screens depend on must survive the removal.
  assert.equal(typeof socialShare.isTouchMobile, 'function')
  assert.equal(typeof socialShare.instagramHref, 'function')
  assert.equal(typeof socialShare.tiktokHref, 'function')
})

test('More… payload is title + url only (no caption text)', () => {
  const url = `${ORIGIN}/watch/live-at-arusha-full-set?s=x`
  const data = nativeShareData(url, 'Live at Arusha')
  assert.deepEqual(data, {
    title: 'Live at Arusha',
    url,
  })
  assert.equal('files' in data, false)
  assert.equal('text' in data, false)
})

test('login next stays on the same video and encodes nested unlock', () => {
  const href = authUrl('login', '/watch/studio-session-track-4?unlock=1')
  assert.equal(href.startsWith('/login?'), true)
  const params = new URLSearchParams(href.slice(href.indexOf('?')))
  assert.equal(params.get('next'), '/watch/studio-session-track-4?unlock=1')
})

test('login next rejects open redirects', () => {
  assert.equal(safeNext('https://evil.example'), null)
  assert.equal(safeNext('//evil.example'), null)
  assert.equal(safeNext('/\\evil.example'), null)
  assert.equal(safeNext('/watch/studio-session-track-4'), '/watch/studio-session-track-4')
})

test('WhatsApp tap does not wait two seconds before opening', () => {
  const src = readFileSync(new URL('../components/watch/ShareSheet.jsx', import.meta.url), 'utf8')
  assert.doesNotMatch(src, /setTimeout\(done, 2000\)/)
})

test('ad skip: 0 is non-skippable, 10 waits for 10s of playback', () => {
  assert.equal(adSkipRules(0).skippable, false)
  assert.equal(adCanSkip(0, 30, true), false)
  assert.equal(adCanSkip(10, 9, true), false)
  assert.equal(adCanSkip(10, 10, true), true)
  assert.equal(adCanSkip(10, 10, false), false)
})
