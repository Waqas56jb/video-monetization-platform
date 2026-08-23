import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  canonicalWatchPath,
  canonicalWatchUrl,
  nativeShareData,
  videoRouteMatches,
  whatsappShareText,
} from './watchUrl.js'
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

test('WhatsApp payload is the watch URL only', () => {
  const url = `${ORIGIN}/watch/behind-the-fame-a-coast-documentary`
  const text = whatsappShareText(url)
  assert.equal(text, url)
  assert.equal(text.includes('Watch this'), false)
  assert.equal(text.endsWith('.mp4'), false)
})

test('More… payload is URL only with no files', () => {
  const url = `${ORIGIN}/watch/live-at-arusha-full-set`
  const data = nativeShareData(url)
  assert.deepEqual(data, { url })
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

test('ad skip: 0 is non-skippable, 10 waits for 10s of playback', () => {
  assert.equal(adSkipRules(0).skippable, false)
  assert.equal(adCanSkip(0, 30, true), false)
  assert.equal(adCanSkip(10, 9, true), false)
  assert.equal(adCanSkip(10, 10, true), true)
  assert.equal(adCanSkip(10, 10, false), false)
})
