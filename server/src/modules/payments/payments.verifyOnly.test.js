/**
 * Milestone 3 payment rules (client, 2026-10-28):
 *   "Do not unlock paid content from a pending or transaction-initiated
 *    response. Only unlock after AirPay verifies the payment successfully."
 *   "Store both the MTONYO+ merchant/order transaction ID and the AirPay
 *    transaction ID."
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { canMove, newMerchantOrderId, publicPayment, PENDING_EXPIRES_MS } from './payments.service.js'

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const routes = read('./payments.routes.js')
const service = read('./payments.service.js')
const provider = read('./provider.js')
const migration = read('../../db/migrations/044_payment_order_ids.sql')
const sweep = read('../../jobs/payments.js')

test('order ids: MTN + Dar es Salaam date + 8 hex, unique per call, gateway-safe characters', () => {
  const at = new Date('2026-10-28T22:30:00Z') // already the 29th in Dar es Salaam (UTC+3)
  const id = newMerchantOrderId(at)
  assert.match(id, /^MTN20261029[0-9A-F]{8}$/)
  assert.equal(id.length, 19)
  assert.notEqual(newMerchantOrderId(at), newMerchantOrderId(at))
})

test('status moves: pending settles once; only a verified success re-opens a closed payment', () => {
  for (const to of ['success', 'failed', 'cancelled', 'expired']) assert.equal(canMove('pending', to), true)
  // The viewer approved late and the gateway confirms it: they get the video.
  for (const from of ['expired', 'failed', 'cancelled']) assert.equal(canMove(from, 'success'), true)
  // Nothing un-pays a success or a refund, and a closed payment never flips between failures.
  for (const to of ['failed', 'cancelled', 'expired', 'pending']) {
    assert.equal(canMove('success', to), false)
    assert.equal(canMove('refunded', to), false)
  }
  assert.equal(canMove('refunded', 'success'), false)
  assert.equal(canMove('expired', 'failed'), false)
  assert.equal(canMove('success', 'success'), false)
})

test('a callback is a doorbell: it names a payment and triggers verification, never settles from its body', () => {
  const hook = routes.slice(routes.indexOf("'/webhook/:provider'"), routes.indexOf('/* ------------------------------------------------------------ sandbox aid'))
  assert.match(hook, /reconcilePayment\(payment, \{ via: 'callback' \}\)/)
  assert.doesNotMatch(hook, /settlePayment\(/, 'the webhook must not record an outcome itself')
  assert.doesNotMatch(hook, /parsed\.status|ref\.status|body\.status/, 'a callback status is never read')
  // A provider's parseCallback returns only which payment — no status field.
  for (const block of provider.split('parseCallback(body) {').slice(1)) {
    assert.doesNotMatch(block.slice(0, block.indexOf('},')), /status/)
  }
  assert.match(hook, /if \(req\.params\.provider !== provider\.name\) throw notFound/)
})

test('the viewer\'s poll and the sweep reach an outcome only through the gateway\'s verify()', () => {
  assert.match(routes, /await reconcilePayment\(payment, \{ via: 'status-poll' \}\)/)
  assert.match(sweep, /reconcilePayment\(p, \{ via: 'sweep' \}\)/)
  const rec = service.slice(service.indexOf('export async function reconcilePayment'), service.indexOf('/** Shape a payment row'))
  assert.match(rec, /await paymentProvider\(\)\.verify\(payment\.provider_ref, payment\)/)
  // "pending" from the gateway is not an outcome.
  assert.match(rec, /if \(status && status !== 'pending'\)/)
  // Past the window with no verdict: expired, so nobody waits forever.
  assert.match(rec, /age > PENDING_EXPIRES_MS/)
  assert.equal(PENDING_EXPIRES_MS, 15 * 60 * 1000)
})

test('every settle is guarded by the state it read, so two workers cannot both settle', () => {
  assert.match(service, /where id = \$1 and status = 'pending' returning \*/)
  assert.match(service, /where id = \$1 and status = \$4\s+returning \*/)
})

test('charged twice is never silent: refund_due is set and no second earning is written', () => {
  const dup = service.slice(service.indexOf('if (!purchase) {'), service.indexOf('await client.query(\n      `insert into earnings'))
  assert.match(dup, /set refund_due = true/)
  assert.match(dup, /return \{ payment: flagged\[0\], purchase: null, duplicate: true \}/)
})

test('both ids are stored and returned; the in-flight window matches the expiry', () => {
  assert.match(migration, /add column if not exists merchant_order_id text/)
  assert.match(migration, /create unique index if not exists payments_merchant_order_id_key/)
  assert.match(migration, /add column if not exists refund_due boolean not null default false/)
  assert.match(routes, /insert into payments \(user_id, video_id, provider, amount_tzs, method, phone, merchant_order_id,\s+traffic_source, traffic_campaign, traffic_referrer\)/)
  assert.match(routes, /orderId: payment\.merchant_order_id,/)
  assert.match(routes, /make_interval\(secs => \$3\)/)
  const shaped = publicPayment({ id: 'x', merchant_order_id: 'MTN2026102800000000', provider_ref: 'AP123', refund_due: true })
  assert.equal(shaped.orderId, 'MTN2026102800000000')
  assert.equal(shaped.providerRef, 'AP123')
  assert.equal(shaped.refundDue, true)
})

test('a gateway that refuses the request closes the attempt, so a retry is not handed a dead "in flight" one', () => {
  assert.match(routes, /The payment request could not be sent to the mobile money provider\. Nothing was charged\./)
})

test('sandbox: forcing an outcome rewrites what its verify() will answer', () => {
  assert.match(routes, /jsonb_set\(coalesce\(raw_callback, '\{\}'::jsonb\), '\{initiated,settlesAs\}', to_jsonb\(\$2::text\), true\)/)
})
