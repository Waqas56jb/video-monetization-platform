/**
 * POST /api/share/crawl-hit must answer, not 500.
 *
 * `recordCrawlerHit` was called in this route and never imported. ESM does not
 * fail on an undeclared identifier at load time, so the module imported cleanly,
 * the router mounted, and the failure only appeared as a ReferenceError inside
 * the handler — surfacing as a 500 on every single call. Verified against
 * production before the fix.
 *
 * The cost was invisible telemetry rather than a broken page: the OG function
 * reports every crawl here, so all HTML-side rows were lost while the image-side
 * path (which imports it correctly) kept working. `crawler_hits` therefore gave
 * a systematically half-true picture of exactly the WhatsApp preview failures it
 * exists to diagnose.
 *
 * This runs the real router over real HTTP rather than matching source text,
 * because a text assertion cannot distinguish "imported" from "resolves at
 * runtime" — and it is the runtime that was broken.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import express from 'express'
import shareRoutes from './share.routes.js'

/**
 * No User-Agent, deliberately.
 *
 * `classifyCrawler` returns 'human' for an absent UA and `recordCrawlerHit`
 * returns before it reaches `query()`, so this test never opens a database
 * connection — even though `npm test` runs with cwd=server and .env present,
 * which makes capabilities.database true.
 */
const BODY = { asset: 'html', slug: 'how-to-cook-pilau-properly', ms: 12, cache: 'miss' }

function listen(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app)
    server.listen(0, '127.0.0.1', () => resolve(server))
  })
}

async function post(server, path, body) {
  const { port } = server.address()
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, text: await res.text() }
}

test('crawl-hit accepts a report instead of 500ing on it', async (t) => {
  const app = express()
  // app.js installs this globally; a directly-mounted router does not inherit
  // it, and without it the handler's `req.body || {}` would pass for the wrong
  // reason — proving nothing.
  app.use(express.json())
  app.use('/api/share', shareRoutes)

  const server = await listen(app)
  t.after(() => new Promise((r) => server.close(r)))

  const res = await post(server, '/api/share/crawl-hit', BODY)

  // Status only. errorHandler rewrites 500 bodies to a generic string whenever
  // env.isProd, which is true unless NODE_ENV === 'development'.
  assert.equal(res.status, 202, `expected 202, got ${res.status}: ${res.text}`)
})

test('a malformed report is still absorbed — telemetry never breaks a caller', async (t) => {
  const app = express()
  app.use(express.json())
  app.use('/api/share', shareRoutes)

  const server = await listen(app)
  t.after(() => new Promise((r) => server.close(r)))

  // The OG function posts from a serverless context that may be torn down
  // mid-flight, so partial bodies are expected rather than exceptional.
  const res = await post(server, '/api/share/crawl-hit', {})
  assert.equal(res.status, 202, `expected 202, got ${res.status}: ${res.text}`)
})
