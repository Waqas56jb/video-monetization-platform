import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import express from 'express'
import { airpayUrls } from './airpay.js'

/**
 * AirPay asked (2026-11-04) for a Website, Success/Failure Return and Webhook
 * URL. They are configured on AirPay's side, so they must follow the domain
 * through settings alone.
 */
test('the AirPay URLs follow the configured domain', () => {
  const u = airpayUrls({ publicWebUrl: 'https://mtonyo.example/', serverPublicUrl: 'https://api.mtonyo.example/' })
  assert.deepEqual(u, {
    website: 'https://mtonyo.example',
    success: 'https://api.mtonyo.example/api/payments/return/airpay/success',
    failure: 'https://api.mtonyo.example/api/payments/return/airpay/failure',
    webhook: 'https://api.mtonyo.example/api/payments/webhook/airpay',
  })
})

test('success, failure and the plain return URL reach the same handler; nothing else does', async () => {
  const src = readFileSync(new URL('./payments.routes.js', import.meta.url), 'utf8')
  const path = src.match(/'(\/return\/:provider[^']*)'/)[1]
  const app = express()
  app.all(path, (req, res) => res.json({ provider: req.params.provider, outcome: req.params.outcome || null }))
  app.use((_req, res) => res.status(404).end())
  const server = app.listen(0)
  const base = `http://127.0.0.1:${server.address().port}`
  try {
    const get = async (p, method = 'GET') => { const r = await fetch(base + p, { method }); return [r.status, r.status === 200 ? await r.json() : null] }
    assert.deepEqual(await get('/return/airpay/success'), [200, { provider: 'airpay', outcome: 'success' }])
    assert.deepEqual(await get('/return/airpay/failure', 'POST'), [200, { provider: 'airpay', outcome: 'failure' }])
    assert.deepEqual(await get('/return/airpay'), [200, { provider: 'airpay', outcome: null }])
    assert.equal((await get('/return/airpay/paid'))[0], 404, 'an outcome word in the URL is not trusted or accepted')
  } finally {
    server.close()
  }
  // The outcome in the URL never feeds the decision.
  const handler = src.slice(src.indexOf("'/return/:provider"), src.indexOf('sandbox aid'))
  assert.doesNotMatch(handler.replace(/if \(req\.params\.outcome\) log\.info\([^\n]*\n/, ''), /params\.outcome/)
})
