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
import { whatsappHref } from './socialShare.js'
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

test('WhatsApp opens the official send URL with only the watch link', () => {
  const url = `${ORIGIN}/watch/studio-session-track-4`
  const href = whatsappHref(url)
  assert.equal(href.startsWith('https://api.whatsapp.com/send?text='), true)
  assert.ok(href.includes(encodeURIComponent(url)))
  assert.equal(href.includes('.mp4'), false)
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
