import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  canonicalWatchPath,
  cardFor,
  crawlerDocument,
  isLinkPreviewBot,
  isPublicSlug,
  isUnfurlFetch,
  notFoundDocument,
  previewCopy,
  slugFrom,
} from './ogDocument.js'

const ORIGIN = 'https://video-monetization-platform-chi.vercel.app'

test('crawler HTML is per-video and never /s/', () => {
  const a = {
    slug: 'studio-session-track-4',
    title: 'Studio Session — Track 4',
    creator: { name: 'Juma Kileo Live' },
  }
  const b = {
    slug: 'behind-the-fame-a-coast-documentary',
    title: 'Behind The Fame',
    creator: { name: 'Other Creator' },
  }
  const htmlA = crawlerDocument({
    canonical: `${ORIGIN}${canonicalWatchPath(a.slug)}`,
    ...previewCopy(a),
    image: cardFor(ORIGIN, a, a.slug),
  })
  const htmlB = crawlerDocument({
    canonical: `${ORIGIN}${canonicalWatchPath(b.slug)}`,
    ...previewCopy(b),
    image: cardFor(ORIGIN, b, b.slug),
  })

  assert.match(htmlA, /og:type" content="video.other"/)
  assert.match(htmlA, /og:site_name" content="MTONYO\+"/)
  assert.match(htmlA, /WATCH FREE PREVIEW · Juma Kileo Live · MTONYO\+/)
  assert.match(htmlA, /\/watch\/studio-session-track-4/)
  assert.doesNotMatch(htmlA, /\/s\//)
  assert.match(htmlA, /\/og\/card\/studio-session-track-4\.jpg/)
  assert.doesNotMatch(htmlA, /behind-the-fame/)
  assert.match(htmlB, /\/og\/card\/behind-the-fame-a-coast-documentary\.jpg/)
  assert.notEqual(
    cardFor(ORIGIN, a, a.slug),
    cardFor(ORIGIN, b, b.slug)
  )
})

test('unknown slug helpers do not invent another video image', () => {
  assert.equal(isPublicSlug('undefined'), false)
  assert.equal(cardFor(ORIGIN, null, 'undefined'), null)
  assert.ok(cardFor(ORIGIN, null, 'studio-session-track-4').endsWith('/og/card/studio-session-track-4.jpg'))
  assert.match(notFoundDocument(), /Not found/)
  assert.doesNotMatch(notFoundDocument(), /og:image/)
})

test('WhatsApp bot UA is a crawler; in-app browser is not', () => {
  assert.equal(isLinkPreviewBot('WhatsApp/2.0'), true)
  assert.equal(
    isLinkPreviewBot(
      'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 WhatsApp/2.0'
    ),
    false
  )
})

test('WhatsApp Web CORS unfurl is treated as a crawler fetch', () => {
  assert.equal(
    isUnfurlFetch({
      headers: {
        'user-agent': 'Mozilla/5.0 Chrome/120',
        'sec-fetch-mode': 'cors',
        'sec-fetch-dest': 'empty',
      },
    }),
    true
  )
  assert.equal(
    isUnfurlFetch({
      headers: {
        'user-agent': 'Mozilla/5.0 Chrome/120',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-dest': 'document',
      },
    }),
    false
  )
})

test('slugFrom strips /s/ and /watch/ and query', () => {
  assert.equal(slugFrom({ query: { slug: 'live-at-arusha-full-set' } }), 'live-at-arusha-full-set')
  assert.equal(slugFrom({ query: {}, url: '/s/studio-session-track-4' }), 'studio-session-track-4')
})
