import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))

test('Watch does not block the film iframe on ad-break loading', () => {
  const src = readFileSync(join(dir, 'Watch.jsx'), 'utf8')
  assert.doesNotMatch(src, /Loading advert/)
  assert.doesNotMatch(src, /adBreaks\.loading && !activeAd/)
  assert.match(src, /takeWarmedPlayback/)
  assert.match(src, /Preview is being prepared/)
  assert.match(src, /unavailable/)
  assert.match(src, /This video is unavailable/)
})

test('after payment Watch drops the warmed preview and waits for the full film', () => {
  const src = readFileSync(join(dir, 'Watch.jsx'), 'utf8')
  assert.match(src, /dropWarmedWatch/)
  assert.match(src, /key=\{`\$\{v\.id\}-\$\{p\.playback\.kind\}`\}/)
  assert.doesNotMatch(src, /justPaid \? 'paid'/)
  assert.match(src, /justPaid && p\.playback\.kind !== 'full'/)
  assert.match(src, /stopAt=\{p\.playback\.kind === 'preview' \? previewSeconds : 0\}/)
})

test('StreamPlayer uncovers the film on canplay, ads still wait for airtime', () => {
  const src = readFileSync(join(dir, '../components/watch/StreamPlayer.jsx'), 'utf8')
  assert.match(src, /player\.addEventListener\('loadeddata', uncoverFilm\)/)
  assert.match(src, /player\.addEventListener\('canplay', uncoverFilm\)/)
  assert.match(src, /player\.videoWidth/)
  assert.match(src, /onMediaSizeRef/)
  assert.match(src, /onReadyRef\.current\?\.\(\)/)
  assert.match(src, /if \(requireAirtimeRef\.current\) return/)
  assert.match(src, /if \(!alive \|\| aired \|\| pausedRef\.current\)/)
  assert.match(src, /needsGesture && !timedOut/)
  assert.match(src, /ensureStreamSdk/)
  assert.doesNotMatch(src, /!ready && !timedOut && \(\s*<button type="button" className="stream-tap"/)
})

test('Watch keeps the film mounted under a pre-roll so Play is not a second boot', () => {
  const src = readFileSync(join(dir, 'Watch.jsx'), 'utf8')
  assert.match(src, /takeWarmedAds/)
  assert.match(src, /player-ad-layer/)
  assert.match(src, /paused=\{Boolean\(activeAd\)\}/)
  assert.doesNotMatch(src, /paused=\{Boolean\(activeAd\) \|\|/)
})

test('Watch sizes the player to the file, not a forced 16:9 box', () => {
  const src = readFileSync(join(dir, 'Watch.jsx'), 'utf8')
  assert.match(src, /videoShape/)
  assert.match(src, /is-\$\{shape\.orientation\}/)
  assert.match(src, /--player-aspect/)
  assert.match(src, /onMediaSize/)

  const css = readFileSync(join(dir, '../styles/realdata.css'), 'utf8')
  assert.match(css, /--player-aspect/)
  assert.match(css, /--player-ratio/)
  assert.match(css, /--player-max-h/)
  assert.doesNotMatch(css, /\.watch-wrap \.player \{[^}]*max-height: min\(56\.25vw, 62dvh\)/)
})

test('a purchase of A remounts Watch and cannot unlock B', () => {
  const app = readFileSync(join(dir, '../App.jsx'), 'utf8')
  assert.match(app, /<Watch key=\{videoId \|\| location\.pathname\} \/>/)

  const src = readFileSync(join(dir, 'Watch.jsx'), 'utf8')
  assert.match(src, /justPaidFor/)
  assert.match(src, /playbackRouteMatches/)
  assert.match(src, /justPaidFor === v\?\.id/)
  assert.match(src, /setJustPaidFor\(v\?\.id \|\| videoId\)/)
  assert.match(src, /showLockGate/)
})

test('the iframe URL is pinned to its source — a growing startAt never reloads the player', () => {
  const src = readFileSync(join(dir, '../components/watch/StreamPlayer.jsx'), 'utf8')

  // The re-pin was the freeze: startAt grows on its own (the page derives it
  // from the position saved every ten seconds), so any re-render during
  // playback re-navigated a live cross-origin iframe.
  assert.doesNotMatch(src, /else if \(playOnReady && Number\(startAt\)/)
  assert.doesNotMatch(src, /pin\.current\.startAt \|\| 0\) \+ 0\.4/)

  // Exactly one place may write the pin, and only when the source changes.
  const writes = src.match(/pin\.current = \{ src,/g) || []
  assert.equal(writes.length, 1, 'the pin must only be written when src changes')
  assert.match(src, /if \(src !== pin\.current\.src\) \{\s*\n\s*pin\.current = \{ src,/)

  // iframeSrc therefore depends on nothing that moves during playback.
  assert.match(src, /\[src, resumeAt, controls\]/)
})

test('moving a running player is a seek, not a new iframe', () => {
  const src = readFileSync(join(dir, '../components/watch/StreamPlayer.jsx'), 'utf8')
  assert.match(src, /seekRequest = null/)
  assert.match(src, /const pendingSeek = useRef/)
  // Held until the player exists: the request can arrive before the SDK boots.
  assert.match(src, /player\.addEventListener\('loadedmetadata', runPendingSeek\)/)
  assert.match(src, /player\.addEventListener\('canplay', runPendingSeek\)/)
  // Only when the player is genuinely elsewhere, so it cannot fight a scrub.
  assert.match(src, /Math\.abs\(\(Number\(player\.currentTime\) \|\| 0\) - want\.seconds\) > 2/)
  // Once per nonce.
  assert.match(src, /want\.applied = true/)
})
