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
