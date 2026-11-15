import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { HLS_CONFIG, startLevelFor, pickEngine } from './hlsEngine.js'

/**
 * Playback on weak and changing networks (client, 2026-11-15): "quality can drop
 * temporarily, playback should keep moving". Measured before/after with a 1080p
 * source under throttling — see FINAL-AUDIT.md "Playback on weak networks".
 */

// Cloudflare's playlist order: top rendition first. That order is what made the
// embedded player start every film at 720p.
const LADDER = [
  { height: 720, bitrate: 3_044_918, averageBitrate: 1_432_402 },
  { height: 480, bitrate: 1_614_102, averageBitrate: 772_646 },
  { height: 360, bitrate: 1_067_406, averageBitrate: 506_344 },
  { height: 240, bitrate: 727_098, averageBitrate: 324_792 },
]

test('the film starts low when the connection is unknown or weak, and does not trust playlist order', () => {
  assert.equal(LADDER[startLevelFor(LADDER, 0)].height, 240, 'no estimate (iPhone/Safari) → lowest')
  assert.equal(LADDER[startLevelFor(LADDER, 0.75)].height, 240, '3G')
  assert.equal(LADDER[startLevelFor(LADDER, 1.6)].height, 480, 'slow 4G: 772k average fits in 800k')
  assert.equal(LADDER[startLevelFor(LADDER, 10)].height, 720, 'Wi-Fi / 4G')
  assert.equal(startLevelFor([], 5), -1)
})

test('settings: adaptive, capped to the screen, quick to drop, cautious to climb, with a real buffer', () => {
  assert.equal(HLS_CONFIG.startLevel, -1)
  assert.equal(HLS_CONFIG.capLevelToPlayerSize, true, 'never fetch more pixels than shown')
  assert.ok(HLS_CONFIG.abrBandWidthFactor < 1 && HLS_CONFIG.abrBandWidthUpFactor < HLS_CONFIG.abrBandWidthFactor)
  assert.ok(HLS_CONFIG.abrEwmaFastVoD <= 3 && HLS_CONFIG.abrEwmaSlowVoD <= 9, 'reacts at least as fast as hls.js defaults')
  assert.ok(HLS_CONFIG.maxStarvationDelay <= 4 && HLS_CONFIG.maxLoadingDelay <= 4)
  assert.ok(HLS_CONFIG.maxBufferLength >= 30 && HLS_CONFIG.maxMaxBufferLength >= HLS_CONFIG.maxBufferLength)
  assert.ok(HLS_CONFIG.fragLoadPolicy.default.errorRetry.maxNumRetry >= 3, 'a dropped fragment is retried, not fatal')
})

test('a playlist that will not load falls back at once; only a failed fragment is retried in place', () => {
  const src = readFileSync(new URL('./hlsEngine.js', import.meta.url), 'utf8')
  const onError = src.slice(src.indexOf('hls.on(Hls.Events.ERROR'), src.indexOf('hls.loadSource(src)'))
  assert.ok(onError.indexOf('/^(manifest|level)/i') < onError.indexOf('hls.startLoad()'), 'playlist failures are checked before any in-place retry')
  assert.match(onError, /recoveries < 3/)
})

test('engine per device: Apple player on iPhone/iPad, hls.js where MSE exists, Cloudflare otherwise', () => {
  const doc = (hls) => ({ createElement: () => ({ canPlayType: (t) => (hls && t === 'application/vnd.apple.mpegurl' ? 'maybe' : '') }) })
  assert.equal(pickEngine({ navigator: { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)' }, document: doc(true), ManagedMediaSource: {} }), 'native')
  assert.equal(pickEngine({ navigator: { userAgent: 'Mozilla/5.0 (Macintosh)', platform: 'MacIntel', maxTouchPoints: 5 }, document: doc(true) }), 'native', 'iPadOS reports as a Mac')
  assert.equal(pickEngine({ navigator: { userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/130' }, document: doc(false), MediaSource: {} }), 'hls')
  assert.equal(pickEngine({ navigator: { userAgent: 'Mozilla/5.0 (Macintosh) Safari/605', platform: 'MacIntel', maxTouchPoints: 0 }, document: doc(true), MediaSource: {} }), 'hls')
  assert.equal(pickEngine({ navigator: { userAgent: 'old' }, document: doc(false) }), 'iframe')
  assert.equal(pickEngine(null), 'iframe')
})

test('the film uses the video engine; adverts stay on Cloudflare; any failure falls back to Cloudflare', () => {
  const player = readFileSync(new URL('../components/watch/StreamPlayer.jsx', import.meta.url), 'utf8')
  const watch = readFileSync(new URL('../pages/Watch.jsx', import.meta.url), 'utf8')
  const ad = readFileSync(new URL('../components/watch/AdBreak.jsx', import.meta.url), 'utf8')
  assert.match(watch, /hlsSrc=\{p\.playback\.hls \|\| null\}/)
  assert.doesNotMatch(ad, /hlsSrc/, 'adverts keep the embedded player')
  assert.match(player, /useState\(\(\) => \(hlsSrc \? pickEngine\(\) : 'iframe'\)\)/)
  assert.match(player, /onFatal: \(\) => \{\s*if \(alive\) fallBack\(\)/)
  assert.match(player, /if \(useVideo\) fallBack\(\)\s*else setFailed\(true\)/)
  const fb = player.slice(player.indexOf('const fallBack = () => {'), player.indexOf('const iframeSrc = useMemo('))
  assert.match(fb, /pin\.current = \{ \.\.\.pin\.current, startAt: at \}/, 'the fallback continues from the current second')
  assert.match(player, /poster=\{poster \|\| undefined\}/, 'thumbnail stays until the first frame is decoded')
  assert.match(player, /player = useVideo \? frame\.current : Stream\(frame\.current\)/, 'one shared control path for both engines')
})
