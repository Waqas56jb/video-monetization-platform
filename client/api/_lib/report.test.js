/**
 * The crawl report carries the whole request, and is sent once, with the
 * answer attached.
 *
 * Four rounds of "sharing from a desktop shows a bare link" were diagnosed
 * from a log that kept only requests whose User-Agent named a crawler. The
 * request that mattered had a browser User-Agent. These pin the contract that
 * replaced that: every header the branch can read, the client's address, and
 * what was served — for every request, whoever sent it.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { captureRequest, reportCrawl, settleReport } from './report.js'

const req = {
  method: 'GET',
  url: '/api/watch?slug=fresh-slug&v=123',
  headers: {
    host: 'example.test',
    'user-agent': 'Mozilla/5.0 (Macintosh) WhatsApp/2.2412.54 Electron/30.0.9',
    accept: '*/*',
    origin: 'https://web.whatsapp.com',
    referer: 'https://web.whatsapp.com/',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'cross-site',
    'sec-ch-ua-platform': '"macOS"',
    'x-forwarded-for': '197.250.1.2, 10.0.0.1',
    'x-vercel-ip-country': 'TZ',
    'x-vercel-ip-city': 'Dar%20es%20Salaam',
    cookie: 'secret=1',
    authorization: 'Bearer nope',
  },
}

test('captureRequest keeps every header the branch reads, and where the request came from', () => {
  const shape = captureRequest(req)
  assert.equal(shape.method, 'GET')
  assert.equal(shape.ip, '197.250.1.2', 'the first hop of X-Forwarded-For is the client')
  assert.equal(shape.country, 'TZ')
  assert.equal(shape.city, 'Dar es Salaam', 'Vercel percent-encodes the city')
  for (const k of ['accept', 'origin', 'referer', 'sec-fetch-dest', 'sec-fetch-mode', 'sec-fetch-site', 'sec-ch-ua-platform']) {
    assert.equal(shape.headers[k], req.headers[k], `${k} is captured verbatim`)
  }
  // Credentials are never part of a crawl record.
  assert.equal(shape.headers.cookie, undefined)
  assert.equal(shape.headers.authorization, undefined)
})

test('reportCrawl posts one body carrying the shape and the answer', async (t) => {
  const real = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) })
    return new Response('', { status: 202 })
  }
  t.after(() => {
    globalThis.fetch = real
  })

  await settleReport(
    reportCrawl('https://api.test', req, {
      asset: 'html',
      slug: 'fresh-slug',
      doc: 'crawler',
      status: 200,
      ms: 412,
      decision: 'sec-fetch-fetch meta=api',
    })
  )

  assert.equal(calls.length, 1, 'exactly one report per request')
  assert.equal(calls[0].url, 'https://api.test/api/share/crawl-hit')
  const b = calls[0].body
  assert.equal(b.asset, 'html')
  assert.equal(b.slug, 'fresh-slug')
  assert.equal(b.query, 'slug=fresh-slug&v=123')
  assert.equal(b.userAgent, req.headers['user-agent'])
  assert.equal(b.doc, 'crawler')
  assert.equal(b.status, 200)
  assert.equal(b.ms, 412)
  assert.equal(b.decision, 'sec-fetch-fetch meta=api')
  assert.equal(b.method, 'GET')
  assert.equal(b.ip, '197.250.1.2')
  assert.equal(b.country, 'TZ')
  assert.equal(b.headers['sec-fetch-mode'], 'cors')
})

test('a failing report never surfaces — telemetry is not worth an error on the path it measures', async (t) => {
  const real = globalThis.fetch
  globalThis.fetch = async () => {
    throw new Error('api down')
  }
  t.after(() => {
    globalThis.fetch = real
  })
  await assert.doesNotReject(settleReport(reportCrawl('https://api.test', req, { asset: 'html', doc: 'shell', status: 200, ms: 1 })))
})
