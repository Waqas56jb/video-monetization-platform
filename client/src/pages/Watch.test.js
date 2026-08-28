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
  assert.doesNotMatch(src, /!ready && !timedOut && \(\s*<button type="button" className="stream-tap"/)
})

test('Watch keeps the film mounted under a pre-roll so Play is not a second boot', () => {
  const src = readFileSync(join(dir, 'Watch.jsx'), 'utf8')
  assert.match(src, /takeWarmedAds/)
  assert.match(src, /player-ad-layer/)
  assert.match(src, /paused=\{Boolean\(activeAd\)/)
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
