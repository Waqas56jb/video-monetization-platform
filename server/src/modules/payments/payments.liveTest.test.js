/**
 * The first real-money AirPay test runs beside the sandbox: only the accounts on
 * AIRPAY_LIVE_TEST_EMAILS pay through live AirPay, every payment is verified by
 * the provider it was made with, and a live payment can never be "simulated".
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { env } from '../../config/env.js'
import { paymentProvider, providerOf, callbackProvider, isAirpayLiveTester } from './provider.js'

const src = (f) => readFileSync(new URL(f, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const AIRPAY = { merchantId: '1', username: 'u', password: 'p', secret: 's', clientId: 'c', clientSecret: 'cs', liveTestEmails: ['owner@mtonyo.test'] }

function withEnv(provider, airpay, fn) {
  const before = { provider: env.payments.provider, airpay: env.payments.airpay }
  env.payments.provider = provider
  env.payments.airpay = { ...env.payments.airpay, ...airpay }
  try { return fn() } finally { env.payments.provider = before.provider; env.payments.airpay = before.airpay }
}

test('a listed account pays through AirPay while everyone else stays on the sandbox', () => {
  withEnv('sandbox', AIRPAY, () => {
    assert.equal(paymentProvider({ email: 'Owner@MTONYO.test ' }).name, 'airpay')
    assert.equal(paymentProvider({ email: 'viewer@mtonyo.test' }).name, 'sandbox')
    assert.equal(paymentProvider().name, 'sandbox', 'no user = the site provider')
  })
})

test('the list does nothing while AirPay is not fully configured', () => {
  withEnv('sandbox', { ...AIRPAY, password: '' }, () => {
    assert.equal(isAirpayLiveTester({ email: 'owner@mtonyo.test' }), false)
    assert.equal(paymentProvider({ email: 'owner@mtonyo.test' }).name, 'sandbox')
  })
})

test('a payment is verified by the provider it was made with, whatever the site uses now', () => {
  withEnv('sandbox', AIRPAY, () => {
    assert.equal(providerOf({ provider: 'airpay' }).name, 'airpay')
    assert.equal(providerOf({ provider: 'sandbox' }).name, 'sandbox')
  })
  withEnv('airpay', AIRPAY, () => assert.equal(providerOf({ provider: 'sandbox' }).name, 'sandbox'))
  const service = src('./payments.service.js')
  assert.match(service, /providerOf\(payment\)\.verify\(/)
  assert.doesNotMatch(service, /paymentProvider\(\)\.verify/)
})

test('AirPay may call back (webhook, return URL) during a live test; an unknown provider may not', () => {
  withEnv('sandbox', AIRPAY, () => {
    assert.equal(callbackProvider('airpay')?.name, 'airpay')
    assert.equal(callbackProvider('sandbox')?.name, 'sandbox')
    assert.equal(callbackProvider('stripe'), null)
  })
  withEnv('sandbox', { ...AIRPAY, password: '' }, () => assert.equal(callbackProvider('airpay'), null))
})

test('routes: a new payment uses the viewer\'s provider, and a live payment is never simulated', () => {
  const routes = src('./payments.routes.js')
  assert.match(routes, /const provider = paymentProvider\(req\.user\)/)
  assert.match(routes, /if \(payment\.provider !== 'sandbox'\) throw forbidden\('Simulation is only available for test payments'\)/)
  // /provider is declared before /:id so it is never read as a payment id
  assert.ok(routes.indexOf("'/provider'") < routes.indexOf("router.get(\n  '/:id'"))
})
