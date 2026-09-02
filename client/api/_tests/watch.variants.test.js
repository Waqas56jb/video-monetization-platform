/**
 * The two documents /watch/:slug can return, requested back to back.
 *
 * Every other test in this suite reads source text. This one runs the handler,
 * because the bug it guards against is not visible in the source: the crawler
 * document and the SPA shell are both correct in isolation, and the failure was
 * a shared cache keying them together. Proving they are genuinely different
 * bodies for one URL is what makes the Vary header load-bearing rather than
 * decorative.
 *
 * Reproduced against production before the fix: an unfurl warmed the edge, and
 * every human who tapped that link for the next five minutes received a page
 * with no <div id="root"> and no script tag.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import handler from '../watch.js'

const SLUG = 'how-to-cook-pilau-properly'
const SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 ' +
  '(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

/** A shell that looks like the built index.html, for when dist/ is absent. */
const FAKE_SHELL =
  '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">' +
  '<title>MTONYO+</title></head><body><div id="root"></div>' +
  '<script type="module" src="/assets/index-test.js"></script></body></html>'

/**
 * No network, in either direction.
 *
 * share-meta and the crawl-hit report both go out over fetch, and index.html is
 * fetched over HTTP when dist/ is not on disk (a clean clone — dist is
 * gitignored). All three are answered here so the test is hermetic and passes
 * whether or not the developer has run a build.
 */
function installFetchStub() {
  const real = globalThis.fetch
  globalThis.fetch = async (input) => {
    const url = String(input)
    if (url.includes('/share-meta')) {
      return new Response(
        JSON.stringify({ title: 'How To Cook Pilau Properly', creator: 'Juma Kileo', sourceKey: 'abc123' }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    }
    if (url.includes('/index.html')) {
      return new Response(FAKE_SHELL, { status: 200, headers: { 'content-type': 'text/html' } })
    }
    // crawl-hit telemetry, and anything else this handler decides to call.
    return new Response('', { status: 202 })
  }
  return () => {
    globalThis.fetch = real
  }
}

function fakeReq(headers) {
  return {
    method: 'GET',
    url: `/api/watch?slug=${SLUG}`,
    query: { slug: SLUG },
    headers: { host: 'example.test', ...headers },
  }
}

function fakeRes() {
  const res = {
    headers: {},
    statusCode: 0,
    body: '',
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = String(v)
      return this
    },
    status(c) {
      this.statusCode = c
      return this
    },
    end(chunk) {
      this.body = chunk == null ? '' : String(chunk)
      return this
    },
  }
  return res
}

const call = async (headers, method = 'GET') => {
  const res = fakeRes()
  const req = fakeReq(headers)
  req.method = method
  await handler(req, res)
  return res
}

test('an unfurl and a human navigation get genuinely different documents', async (t) => {
  const restore = installFetchStub()
  t.after(restore)

  // (a) WhatsApp Web / Desktop: the viewer's own browser UA, fetched not navigated.
  const unfurl = await call({
    'user-agent': SAFARI,
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'cross-site',
  })

  // (b) the same person, same UA, same URL — now actually opening the page.
  const human = await call({
    'user-agent': SAFARI,
    'sec-fetch-dest': 'document',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': 'none',
  })

  assert.equal(unfurl.statusCode, 200)
  assert.equal(human.statusCode, 200)

  // This is the whole point of the test: the human MUST receive an application.
  assert.match(human.body, /<div id="root">/, 'the human response must boot the SPA')
  assert.match(human.body, /<script/, 'the human response must carry a script tag')

  // And the unfurl must not — it is the small og-only document.
  assert.doesNotMatch(unfurl.body, /<div id="root">/)
  assert.notEqual(unfurl.body, human.body, 'two documents, one URL — hence Vary')

  // Both still carry per-video Open Graph, which is what the unfurl came for.
  for (const res of [unfurl, human]) {
    assert.match(res.body, /property="og:title"/)
    assert.match(res.body, /\/og\/card\/how-to-cook-pilau-properly\.jpg/)
  }
})

test('both responses declare the headers that separate them', async (t) => {
  const restore = installFetchStub()
  t.after(restore)

  const unfurl = await call({
    'user-agent': SAFARI,
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
  })
  const human = await call({
    'user-agent': SAFARI,
    'sec-fetch-dest': 'document',
    'sec-fetch-mode': 'navigate',
  })

  for (const res of [unfurl, human]) {
    const vary = res.headers.vary || ''
    assert.match(vary, /Sec-Fetch-Dest/, 'Vary must name the header the branch reads')
    assert.match(vary, /Sec-Fetch-Mode/)
    assert.match(vary, /User-Agent/)
  }

  // The crawler document is the dangerous one to hold, so it is held briefly.
  assert.match(unfurl.headers['cache-control'], /s-maxage=60\b/)
  assert.match(human.headers['cache-control'], /s-maxage=300\b/)
})

test('the site name is not doubled when no creator is known', async (t) => {
  // Force the share-meta lookup to fail so `creator` is empty — the cold-instance
  // case that produced "… — MTONYO+ | MTONYO+" in production.
  const real = globalThis.fetch
  globalThis.fetch = async (input) => {
    const url = String(input)
    if (url.includes('/index.html')) {
      return new Response(FAKE_SHELL, { status: 200, headers: { 'content-type': 'text/html' } })
    }
    if (url.includes('/share-meta')) return new Response('', { status: 500 })
    return new Response('', { status: 202 })
  }
  t.after(() => {
    globalThis.fetch = real
  })

  const res = await call({
    'user-agent': SAFARI,
    'sec-fetch-dest': 'document',
    'sec-fetch-mode': 'navigate',
  })

  const title = (res.body.match(/<title>([^<]*)<\/title>/) || [])[1] || ''
  assert.ok(title.includes('MTONYO+'), 'the site name still appears once')
  assert.equal(
    title.split('MTONYO+').length - 1,
    1,
    `the site name must appear exactly once, got: ${title}`
  )
})


/**
 * A browser-side link preview is a CROSS-ORIGIN FETCH, and it obeys CORS.
 *
 * This is the difference between a rich card and a bare URL on exactly one kind
 * of client. WhatsApp on Android and on Windows are native clients that do no
 * CORS at all and were always fine; a Mac fetches the preview through a web
 * stack that does, and got nothing.
 *
 * The GET already answered with `Access-Control-Allow-Origin`. THE PREFLIGHT DID
 * NOT ANSWER WITH `Access-Control-Allow-Methods`, so the browser rejected the
 * preflight and never sent the GET — the header that was present was never
 * reached. Measured against production before the fix:
 *
 *   OPTIONS /watch/live-at-arusha-full-set
 *     HTTP/1.1 200 OK
 *     Access-Control-Allow-Origin: *          <- and nothing else
 */
test('a preflight is answered completely enough for a browser to proceed', async (t) => {
  const restore = installFetchStub()
  t.after(restore)

  const pre = await call(
    {
      origin: 'https://web.whatsapp.com',
      'access-control-request-method': 'GET',
      'access-control-request-headers': 'content-type',
    },
    'OPTIONS'
  )

  assert.equal(pre.statusCode, 204, 'a preflight has no body to return')
  assert.equal(pre.headers['access-control-allow-origin'], '*')
  assert.match(
    pre.headers['access-control-allow-methods'] || '',
    /GET/,
    'without Allow-Methods the browser rejects the preflight and never sends the GET'
  )
  assert.equal(pre.headers['access-control-allow-headers'], 'content-type')
  assert.ok(pre.headers['access-control-max-age'], 'so the browser need not ask again every time')
  assert.equal(pre.body, '', 'and it does no work: no share-meta, no document')
})

test('every document this route can return is readable cross-origin', async (t) => {
  const restore = installFetchStub()
  t.after(restore)

  const crawler = await call({ 'user-agent': 'WhatsApp/2.24.15.78 N' })
  assert.equal(crawler.headers['x-doc'], 'crawler')
  assert.equal(crawler.headers['access-control-allow-origin'], '*')

  const shell = await call({
    'user-agent': SAFARI,
    'sec-fetch-dest': 'document',
    'sec-fetch-mode': 'navigate',
  })
  assert.equal(shell.headers['x-doc'], 'shell')
  assert.equal(
    shell.headers['access-control-allow-origin'],
    '*',
    'the shell carries the og tags too, so a scraper that lands here must be able to read it'
  )
})
