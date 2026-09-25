import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

/**
 * "When I play a video or an advert it delays, and a white screen appears."
 * (client, 2026-09-17)
 *
 * Measured on production before anything changed (Pixel 7 profile, CPU x4,
 * 3G-class network — scripts/e2e/evidence/player-white-2026-09-17-before.txt):
 *
 *   - the player box went 79–84% WHITE for 2–5 seconds on every start. The
 *     Stream embed document is a bare white page until Cloudflare's own
 *     player script runs, and StreamPlayer's 1.5s failsafe uncovered the
 *     frame before that script had arrived. Matching the iframe's
 *     color-scheme to the document's was measured and made no difference.
 *
 *   - a Free + Ads start held BOTH the film and the advert for 1.5s (the
 *     advert layer lived in the same JSX branch as the film), then booted
 *     the two iframes side by side, their media segments interleaved.
 *
 * These pin the fix: the frame is revealed on the document's own `load` or
 * the SDK's ready events, with the thumbnail showing until then and only an
 * 8s last-resort timer; the advert renders during the hold; the film waits
 * for the advert's airtime.
 */
const dir = dirname(fileURLToPath(import.meta.url))
const player = readFileSync(join(dir, 'StreamPlayer.jsx'), 'utf8')
const adBreak = readFileSync(join(dir, 'AdBreak.jsx'), 'utf8')
const watch = readFileSync(join(dir, '../../pages/Watch.jsx'), 'utf8')

test('the frame is never uncovered by a short timer — reveal on load / SDK ready, 8s last resort', () => {
  assert.match(player, /const failsafe = setTimeout\(\(\) => setPainted\(true\), 8000\)/)
  assert.doesNotMatch(player, /setPainted\(true\), 1500\)/)
  // The real reveals are still there.
  assert.match(player, /onLoad=\{\(\) => \{\s*\n[^]*?setPainted\(true\)/)
  assert.match(player, /const announceReady = \(\) => \{\s*\n\s*setPainted\(true\)/)
  // And the frame starts hidden over the poster, not white.
  const css = readFileSync(join(dir, '../../styles/realdata.css'), 'utf8')
  assert.match(css, /\.stream-frame \{[^}]*opacity: 0;/)
  assert.match(css, /\.stream-frame\.is-painted \{\s*opacity: 1;/)
})

test('the advert reports its first genuine airtime exactly once', () => {
  assert.match(adBreak, /export default function AdBreak\(\{ ad, videoId, playId, onFinished, onAirtime \}\)/)
  assert.match(adBreak, /if \(!airedOnce\.current\) \{\s*airedOnce\.current = true\s*onAirtime\?\.\(\)\s*\}/)
  // Reported only from real airtime, after the floor — never from mount or canplay.
  const at = adBreak.indexOf('onAirtime?.()')
  const before = adBreak.slice(0, at)
  assert.match(before.slice(-400), /if \(!adAirtimeStarted\(t\)\) return/)
})

test('the pre-roll renders during the hold, and the film waits for its airtime (6s ceiling)', () => {
  // One advert layer, rendered from both branches.
  assert.match(watch, /const renderAdLayer = \(\) =>/)
  assert.equal((watch.match(/\{renderAdLayer\(\)\}/g) || []).length, 2, 'both the hold branch and the live branch render the advert')
  assert.doesNotMatch(watch, /\{activeAd && \(\s*<div className="player-ad-layer">/)
  // Airtime releases the hold; so does the pre-roll ending; a timer is only a ceiling.
  assert.match(watch, /onAirtime=\{\(\) => \{\s*setFirstFrame\(true\)\s*if \(activeAd\.placement === 'pre_roll'\) setPreRollHeadStartDone\(true\)/)
  assert.match(watch, /if \(activeAd\?\.placement === 'pre_roll'\) setPreRollHeadStartDone\(true\)\s*\n\s*setActiveAd\(null\)/)
  assert.match(watch, /setTimeout\(\(\) => setPreRollHeadStartDone\(true\), 6000\)/)
  assert.doesNotMatch(watch, /setPreRollHeadStartDone\(true\), 1500\)/)
})

test('a film held under an advert stays held — autoplay in the URL cannot start it underneath', () => {
  // The URL always asks for autoplay, and Stream acts on it after the SDK attaches.
  assert.match(player, /url\.searchParams\.set\('autoplay', 'true'\)/)
  // So the hold is re-applied every time the player starts, not once at attach.
  assert.match(player, /const holdIfPaused = \(\) => \{\s*if \(!pausedRef\.current\) return/)
  assert.match(player, /player\.addEventListener\('play', holdIfPaused\)/)
  assert.match(player, /player\.addEventListener\('playing', holdIfPaused\)/)
  // And the page really does hold the film while any advert is on.
  assert.match(watch, /paused=\{Boolean\(activeAd\)\}/)
})

test('one loading screen: poster + one MTONYO+ indicator until real frames move, with every way out', () => {
  // Real airtime only — not canplay/loadedmetadata, which fire seconds before a frame moves.
  assert.match(player, /measurePerf\('playerBoot', 'boot-to-first-frame'\)\s*onPlayingRef\.current\?\.\(\)\s*onFirstFrameRef\.current\?\.\(\)/)
  const ready = player.slice(player.indexOf('const announceReady = () => {'), player.indexOf("player.addEventListener('loadedmetadata', announceReady)"))
  assert.doesNotMatch(ready, /onFirstFrame/, 'ready is not a first frame')
  // The overlay, over the whole box, lifted by either first frame — film or advert.
  assert.match(watch, /className="player-loading"/)
  assert.match(watch, /onFirstFrame=\{\(\) => setFirstFrame\(true\)\}/)
  assert.match(watch, /onAirtime=\{\(\) => \{\s*setFirstFrame\(true\)/)
  // It can never hide a player that needs a person.
  assert.match(watch, /onAutoplayBlocked=\{\(\) => setLoaderReleased\(true\)\}/)
  assert.match(watch, /onFailed=\{\(\) => setLoaderReleased\(true\)\}/)
  assert.match(watch, /setTimeout\(\(\) => setLoaderReleased\(true\), 20000\)/)
  assert.match(watch, /!\(waitingForPlayback && bootStage >= 3\)/)
  assert.match(watch, /!showLockGate &&/)
  const css = readFileSync(join(dir, '../../styles/realdata.css'), 'utf8')
  assert.match(css, /\.player-loading \{[^}]*z-index: 5;/)
})
