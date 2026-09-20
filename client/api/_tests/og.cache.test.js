/**
 * /og/card/:slug.jpg must never cache the API's PLACEHOLDER as if it were
 * the real, finished card.
 *
 * Reproduced against production before the fix (client report, 2026-09-20):
 * one published video's share preview showed the generic MTONYO+ card while
 * another's showed correctly, consistently, on every retry — the same code
 * serving two different results for two videos. The route always used the
 * same week-long Cache-Control regardless of whether the API answered with
 * a genuinely built card (`X-Share-Card: built`) or its placeholder while a
 * build was still queued (`X-Share-Card: fallback`). Whichever one a given
 * Vercel edge region happened to cache on the FIRST request for that video's
 * `?v=` stayed cached there for up to a week — a real race, not a flat bug,
 * which is exactly why it looked video-specific and inconsistent rather than
 * simply broken.
 *
 * This runs the real handler against a mocked upstream, because the bug is
 * about the response headers a real invocation produces, not the source text.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const SLUG = 'ugali-samaki-sunday-cooking'
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(1200, 1)])

/**
 * A fresh module per test, cache-busted like app.build.test.js does.
 *
 * og.js keeps its own bucket-breaker state at module scope (`bucket`), which
 * is exactly right in production — one instance, one breaker — but makes the
 * tests order-dependent if they share an import: a 404 from the storage
 * bucket in one test trips the breaker for the next, which then silently
 * skips the bucket branch this file means to exercise directly.
 */
let n = 0
const freshHandler = async () => (await import(`../og.js?t=${n++}`)).default

function installFetchStub({ bucketOk = false, apiStatus = 200, apiTag = 'built' } = {}) {
  const real = globalThis.fetch
  globalThis.fetch = async (input) => {
    const url = String(input)
    if (url.includes('/storage/v1/object/public/')) {
      return bucketOk
        ? new Response(JPEG, { status: 200, headers: { 'content-type': 'image/jpeg' } })
        : new Response('', { status: 404 })
    }
    if (url.includes('/api/share-card/')) {
      if (apiStatus !== 200) return new Response('', { status: apiStatus })
      return new Response(JPEG, {
        status: 200,
        headers: { 'content-type': 'image/jpeg', 'x-share-card': apiTag },
      })
    }
    // crawl-hit telemetry and anything else
    return new Response('', { status: 202 })
  }
  return () => {
    globalThis.fetch = real
  }
}

function fakeReq({ query = {}, method = 'GET' } = {}) {
  return {
    method,
    query: { slug: `${SLUG}.jpg`, ...query },
    headers: { origin: 'https://example.com' },
    url: `/api/og?slug=${SLUG}.jpg${query.v ? `&v=${query.v}` : ''}`,
    get(name) {
      return this.headers[name.toLowerCase()]
    },
  }
}

function fakeRes() {
  const res = {
    statusCode: null,
    headers: {},
    body: null,
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v
    },
    status(code) {
      this.statusCode = code
      return this
    },
    end(body) {
      this.body = body
      return this
    },
  }
  return res
}

test('a genuinely built card is cached long — a week of stale-while-revalidate', async () => {
  const restore = installFetchStub({ bucketOk: false, apiStatus: 200, apiTag: 'built' })
  try {
    const res = fakeRes()
    await (await freshHandler())(fakeReq({ query: { v: 'abc123' } }), res)
    assert.equal(res.statusCode, 200)
    assert.match(res.headers['cache-control'], /max-age=86400/)
    assert.match(res.headers['cache-control'], /stale-while-revalidate=604800/)
  } finally {
    restore()
  }
})

test("the API's placeholder — a build still queued or running — is cached SHORT, never a week", async () => {
  const restore = installFetchStub({ bucketOk: false, apiStatus: 200, apiTag: 'fallback' })
  try {
    const res = fakeRes()
    await (await freshHandler())(fakeReq({ query: { v: 'abc123' } }), res)
    assert.equal(res.statusCode, 200)
    assert.doesNotMatch(res.headers['cache-control'], /max-age=86400/, 'the placeholder must not get the built card\'s lifetime')
    assert.doesNotMatch(res.headers['cache-control'], /604800/)
    assert.match(res.headers['cache-control'], /max-age=60/)
  } finally {
    restore()
  }
})

test('a bucket hit (the real card, uploaded once the build lands) is cached long', async () => {
  const restore = installFetchStub({ bucketOk: true })
  try {
    const res = fakeRes()
    await (await freshHandler())(fakeReq({ query: { v: 'abc123' } }), res)
    assert.equal(res.statusCode, 200)
    assert.equal(res.headers['x-share-card'], 'cdn')
    assert.match(res.headers['cache-control'], /max-age=86400/)
  } finally {
    restore()
  }
})

test('an upstream error is never cached — no-store, not the week-long default', async () => {
  const restore = installFetchStub({ bucketOk: false, apiStatus: 503 })
  try {
    const res = fakeRes()
    await (await freshHandler())(fakeReq({ query: { v: 'abc123' } }), res)
    assert.equal(res.statusCode, 503)
    assert.equal(res.headers['cache-control'], 'no-store')
  } finally {
    restore()
  }
})

test('a network failure to the API is never cached', async () => {
  const real = globalThis.fetch
  globalThis.fetch = async (input) => {
    const url = String(input)
    if (url.includes('/storage/v1/object/public/')) return new Response('', { status: 404 })
    if (url.includes('/api/share-card/')) throw new Error('network down')
    return new Response('', { status: 202 })
  }
  try {
    const res = fakeRes()
    await (await freshHandler())(fakeReq({ query: { v: 'abc123' } }), res)
    assert.equal(res.statusCode, 502)
    assert.equal(res.headers['cache-control'], 'no-store')
  } finally {
    globalThis.fetch = real
  }
})

test('a malformed slug is refused without ever being cached', async () => {
  const restore = installFetchStub()
  try {
    const res = fakeRes()
    await (await freshHandler())(fakeReq({ query: { slug: 'not a slug!!.jpg' } }), res)
    assert.equal(res.statusCode, 404)
    assert.equal(res.headers['cache-control'], 'no-store')
  } finally {
    restore()
  }
})

test('vercel.json no longer stamps a week-long cache on every /og/ response regardless of status', () => {
  const vercelConfig = JSON.parse(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'vercel.json'), 'utf8')
  )
  const ogRule = (vercelConfig.headers || []).find((h) => h.source === '/og/(.*)')
  assert.equal(ogRule, undefined, 'og.js now sets Cache-Control itself, per branch — no blanket platform rule to fight it')
})
