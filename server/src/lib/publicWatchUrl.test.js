import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isPublicSlug,
  publicOgCardUrl,
  publicWatchPath,
  publicWatchUrl,
  publicWebOrigin,
} from './publicWatchUrl.js'

test('canonical path is /watch/{slug} only', () => {
  assert.equal(publicWatchPath('studio-session-track-4'), '/watch/studio-session-track-4')
  assert.equal(publicWatchPath('undefined'), null)
  assert.equal(publicWatchPath(''), null)
  assert.equal(publicWatchPath(null), null)
})

test('public watch URL never uses UUID fallback or /s/', () => {
  const origin = 'https://video-monetization-platform-chi.vercel.app'
  assert.equal(
    publicWatchUrl(origin, 'behind-the-fame-a-coast-documentary'),
    `${origin}/watch/behind-the-fame-a-coast-documentary`
  )
  assert.equal(publicWatchUrl(origin, ''), null)
})

test('OG card URL is same-origin /og/card/{slug}.jpg', () => {
  const origin = 'https://video-monetization-platform-chi.vercel.app'
  assert.equal(
    publicOgCardUrl(origin, 'live-at-arusha-full-set'),
    `${origin}/og/card/live-at-arusha-full-set.jpg`
  )
  assert.notEqual(
    publicOgCardUrl(origin, 'studio-session-track-4'),
    publicOgCardUrl(origin, 'behind-the-fame-a-coast-documentary')
  )
})

test('production origin does not stay on localhost', () => {
  const prev = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
  try {
    assert.equal(
      publicWebOrigin('http://localhost:5173'),
      'https://video-monetization-platform-chi.vercel.app'
    )
    assert.equal(
      publicWebOrigin('https://video-monetization-platform-chi.vercel.app'),
      'https://video-monetization-platform-chi.vercel.app'
    )
  } finally {
    process.env.NODE_ENV = prev
  }
})

test('isPublicSlug rejects junk used for /og/card/undefined.jpg', () => {
  assert.equal(isPublicSlug('undefined'), false)
  assert.equal(isPublicSlug('null'), false)
  assert.equal(isPublicSlug('studio-session-track-4'), true)
})
