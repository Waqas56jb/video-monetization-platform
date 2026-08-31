import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'watch.js'), 'utf8')

test('watch HTML serves a crawler document to WhatsApp and never claims og:video', () => {
  assert.match(src, /isLinkPreviewBot/)
  assert.match(src, /isUnfurlFetch/)
  assert.match(src, /crawlerDocument/)
  assert.match(src, /og:type" content="website"/)
  assert.doesNotMatch(src, /og:type" content="video\.other"/)
})

test('og:image is same-origin /og/card and crawlers do not wait on a cold API', () => {
  assert.match(src, /function ogCardUrl/)
  assert.match(src, /\/og\/card\//)
  assert.match(src, /CRAWLER_META_MS = 600/)
  assert.match(src, /if \(meta\) \{[\s\S]{0,120}metaMemo\.set/, 'a successful lookup is memoized')
  assert.doesNotMatch(src, /\$\{API\}\/api\/share-card/)
})

test('a browser asks for the real title, on a much smaller budget than a crawler', () => {
  // Both ask. `previewBot` is not the same question as "will anything read
  // these og: tags" — iMessage and Signal send a browser UA with
  // Sec-Fetch-Mode: navigate and land in the shell branch.
  assert.match(src, /function memoedShareMeta/)
  assert.match(src, /BROWSER_META_MS = 350/)
  assert.match(src, /CRAWLER_META_MS = 600/)
  assert.match(
    src,
    /await loadShareMeta\(slug, previewBot \? CRAWLER_META_MS : BROWSER_META_MS\)/,
    'the budget, not the presence of the call, is what separates the two'
  )

  // A down API must cost one request per instance, not one per visitor. This
  // is the property the original 1.5s-for-everybody version lacked.
  assert.match(src, /META_MISS_MS/)
  assert.match(src, /function recentlyMissed/)
  assert.match(src, /if \(recentlyMissed\(slug\)\) return null/)

  // memoedShareMeta must stay synchronous — the memo is the warm-path answer.
  assert.doesNotMatch(src, /async function memoedShareMeta/)
})

test('the site name is never doubled in the title', () => {
  // `Title — MTONYO+ | MTONYO+` shipped for every document with no creator,
  // which is the whole no-shell branch and any cold-instance browser response.
  assert.match(src, /function pageTitle/)
  assert.doesNotMatch(src, /escapeAttr\(creator \|\| 'MTONYO\+'\)\} \| MTONYO\+/)
  assert.match(src, /by && by !== site/)
})

test('every response varies on the headers the handler actually branches on', () => {
  // isUnfurlFetch reads Sec-Fetch-Dest/Mode. Leaving them out of Vary let the
  // edge store one variant and serve it to both audiences — a human tapping a
  // shared link received the crawler document, with no app in it.
  const vary = src.match(/res\.setHeader\('Vary', ([A-Z_]+|'[^']*')\)/g) || []
  assert.equal(vary.length, 3, 'crawler, no-shell fallback and shell must all set Vary')
  for (const v of vary) assert.match(v, /VARY/, 'use the shared constant, not a literal')

  assert.match(src, /const VARY = '[^']*Sec-Fetch-Dest[^']*'/)
  assert.match(src, /const VARY = '[^']*Sec-Fetch-Mode[^']*'/)
  assert.match(src, /const VARY = '[^']*User-Agent[^']*'/)

  // Every path that writes HTML must declare it: three res.end() calls, three Vary.
  const ends = src.match(/res\.end\(/g) || []
  assert.equal(ends.length, 3, 'if a fourth response path appears it needs Vary too')
})

test('a document with no application in it is never stored at the edge for long', () => {
  // Defence in depth behind Vary: if an intermediary ever drops Sec-Fetch-*,
  // this bounds the blast radius to a minute instead of five.
  assert.match(src, /CRAWLER_CACHE = 'public, s-maxage=60/)
  assert.match(src, /SHELL_CACHE_CONTROL = 'public, s-maxage=300/)
  // The no-shell fallback has no app in it at all, so it is never cached.
  assert.match(src, /res\.setHeader\('Cache-Control', 'no-store'\)/)
})
