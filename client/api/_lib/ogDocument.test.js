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
  experimentToken,
  withToken,
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

  assert.match(htmlA, /og:type" content="website"/)
  assert.doesNotMatch(htmlA, /video\.other/)
  assert.match(htmlA, /og:site_name" content="MTONYO\+"/)
  assert.match(htmlA, /WATCH FREE PREVIEW · Juma Kileo Live · MTONYO\+/)
  assert.match(htmlA, /\/watch\/studio-session-track-4/)
  assert.doesNotMatch(htmlA, /\/s\//)
  assert.match(htmlA, /\/og\/card\/studio-session-track-4\.jpg/)
  assert.match(htmlA, /og:image:width" content="1200"/)
  assert.match(htmlA, /og:image:height" content="630"/)
  assert.match(htmlA, /og:image:type" content="image\/jpeg"/)
  assert.doesNotMatch(htmlA, /\/api\/share-card/)
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

test('a genuine Firefox navigation is never treated as an unfurl fetch, even with fetch-shaped Sec-Fetch headers', () => {
  // Captured live from Vercel's own function logs, 2026-09-07: re-opening
  // the same /watch/:slug with a new query string, from an already-loaded
  // page, in real Firefox 155 driven by Playwright. resourceType was
  // 'document' and Playwright's own header APIs all reported
  // dest=document/mode=navigate/site=none for this request — Vercel's
  // function received this instead. See DECISIONS.md, 2026-09-07.
  const firefoxNavigationMisreportingSecFetch = {
    headers: {
      host: 'video-monetization-platform-chi.vercel.app',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:155.0) Gecko/20100101 Firefox/155.0',
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'en-US,en;q=0.9',
      'accept-encoding': 'gzip, deflate, br, zstd',
      'upgrade-insecure-requests': '1',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'same-origin',
      'sec-fetch-site': 'same-origin',
      connection: 'close',
    },
  }
  assert.equal(isUnfurlFetch(firefoxNavigationMisreportingSecFetch), false)

  // The same-origin warming fetch this fix must not start letting through:
  // warmShare.js's own `fetch(u, { mode: 'no-cors' })`, no Accept override
  // and no Upgrade-Insecure-Requests -- a plain fetch() sends neither.
  assert.equal(
    isUnfurlFetch({
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:155.0) Gecko/20100101 Firefox/155.0',
        accept: '*/*',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'same-origin',
        'sec-fetch-site': 'same-origin',
      },
    }),
    true
  )
})

test('slugFrom strips /s/ and /watch/ and query', () => {
  assert.equal(slugFrom({ query: { slug: 'live-at-arusha-full-set' } }), 'live-at-arusha-full-set')
  assert.equal(slugFrom({ query: {}, url: '/s/studio-session-track-4' }), 'studio-session-track-4')
})

test('experimentToken accepts a short safe token and nothing else', () => {
  assert.equal(experimentToken({ query: { e: 'exp-a1' } }), 'exp-a1')
  assert.equal(experimentToken({ query: {} }), null)
  assert.equal(experimentToken({}), null)
  // It is echoed straight into og:url and og:image, so anything that could
  // carry a quote, a path or a second parameter has to be refused here.
  assert.equal(experimentToken({ query: { e: 'a/../b' } }), null)
  assert.equal(experimentToken({ query: { e: 'a"b' } }), null)
  assert.equal(experimentToken({ query: { e: 'a&x=1' } }), null)
  assert.equal(experimentToken({ query: { e: 'x'.repeat(25) } }), null)
})

test('withToken makes each arm of the experiment a distinct URL', () => {
  assert.equal(withToken('https://h/watch/s', 'a1'), 'https://h/watch/s?e=a1')
  assert.equal(withToken('https://h/og/card/s.jpg?v=2', 'a1'), 'https://h/og/card/s.jpg?v=2&e=a1')
  // Without a token nothing changes, so ordinary shares keep clean URLs.
  assert.equal(withToken('https://h/watch/s', null), 'https://h/watch/s')
  assert.equal(withToken(null, 'a1'), null)
})
