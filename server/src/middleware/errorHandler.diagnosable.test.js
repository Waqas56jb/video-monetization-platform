import { test } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { errorHandler } from './errorHandler.js'

/**
 * A 500 must narrow the problem without widening the disclosure.
 *
 * Sign-in returned 500 in production and the body said only "Something went
 * wrong on our side" — the same six words for a thrown network error, a bad
 * column, or a client library rejecting instead of returning. Diagnosing it from
 * outside was impossible.
 */
async function call(thrown, { prod = true } = {}) {
  const saved = process.env.NODE_ENV
  process.env.NODE_ENV = prod ? 'production' : 'development'
  const app = express()
  app.get('/boom', (_req, _res, next) => next(thrown))
  app.use(errorHandler)
  const server = app.listen(0)
  try {
    await new Promise((r) => server.once('listening', r))
    const res = await fetch(`http://127.0.0.1:${server.address().port}/boom`, {
      headers: { 'x-railway-request-id': 'req-abc-123' },
    })
    return { status: res.status, body: await res.json() }
  } finally {
    await new Promise((r) => server.close(r))
    process.env.NODE_ENV = saved
  }
}

test('a 500 names the error class and the request reference', async () => {
  const res = await call(new TypeError('fetch failed to https://internal.example'))
  assert.equal(res.status, 500)
  assert.equal(res.body.error.errorClass, 'TypeError')
  assert.equal(res.body.error.ref, 'req-abc-123')
})

test('the underlying message is never sent to the caller', async () => {
  // The class narrows the cause; the message may hold a hostname, a query, or
  // a value from someone's account, and none of that belongs in a response.
  const res = await call(new TypeError('connect ECONNREFUSED 10.0.0.4:5432 for user waqas'))
  const body = JSON.stringify(res.body)
  assert.equal(res.body.error.message, 'Something went wrong on our side')
  assert.doesNotMatch(body, /ECONNREFUSED|10\.0\.0\.4|waqas/)
  assert.doesNotMatch(body, /at Object|\.js:\d+/, 'no stack frames')
})

test('a 4xx is untouched — its message is the point', async () => {
  const err = new Error('Email or password is incorrect')
  err.status = 401
  const res = await call(err)
  assert.equal(res.status, 401)
  assert.equal(res.body.error.message, 'Email or password is incorrect')
  assert.equal(res.body.error.errorClass, undefined)
})

test('a 500 with no request id still reports the class', async () => {
  const app = express()
  app.get('/boom', (_req, _res, next) => next(new RangeError('nope')))
  app.use(errorHandler)
  const saved = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
  const server = app.listen(0)
  try {
    await new Promise((r) => server.once('listening', r))
    const res = await fetch(`http://127.0.0.1:${server.address().port}/boom`)
    const body = await res.json()
    assert.equal(body.error.errorClass, 'RangeError')
    assert.equal(body.error.ref, undefined)
  } finally {
    await new Promise((r) => server.close(r))
    process.env.NODE_ENV = saved
  }
})
