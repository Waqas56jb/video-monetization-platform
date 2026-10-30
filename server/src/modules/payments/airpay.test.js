/**
 * AirPay Tanzania provider, against its published reference (sanctum.airpay.tz).
 * Expected and unexpected answers alike: only a verified 200 for THIS order and
 * THIS amount may ever become a success.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import http from 'node:http'
import { readFileSync } from 'node:fs'
import {
  privateKeyFor, checksumKeyFor, checksumOf, airpayDate, crc32, checkoutForm, buyerFrom,
  parseAirpayResponse, verdictFrom, verifyOrder, orderFromCallback, secureHashMatches, missingAirpayConfig, STATUS_MAP,
} from './airpay.js'

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex')
const CFG = {
  merchantId: '247134', username: 'user-x', password: 'pass-y', secret: 'secret-z',
  payUrl: 'https://payments.airpay.tz/pay/index.php', verifyUrl: 'http://127.0.0.1:1/verify',
  currency: '834', isoCurrency: 'TZS', chmod: '', timeZone: 'Africa/Dar_es_Salaam', timeoutMs: 2000,
}
const PAYMENT = { id: 'p1', merchant_order_id: 'MTN20261028A1B2C3D4', provider_ref: null, amount_tzs: 5000 }

test('formulas exactly as AirPay publishes them', () => {
  assert.equal(privateKeyFor(CFG), sha('secret-z@user-x:|:pass-y'))
  assert.equal(checksumKeyFor(CFG), sha('user-x~:~pass-y'))
  assert.equal(checksumOf('k', 'abc'), sha('k@abc'))
  assert.equal(airpayDate(new Date('2026-10-28T22:30:00Z')), '2026-10-29', 'Dar es Salaam date, not UTC')
  assert.equal(crc32('The quick brown fox jumps over the lazy dog'), 0x414fa339)
})

test('the checkout form: right fields, right checksum, and no credential in it', () => {
  const now = new Date('2026-10-28T10:00:00Z')
  const f = checkoutForm({ cfg: CFG, orderId: PAYMENT.merchant_order_id, amountTzs: 5000, userId: 'a1b2-c3', email: 'viewer@example.com', fullName: 'Asha Juma Mrisho', phone: '0712 345 678', method: 'mpesa', now })
  assert.equal(f.amount, '5000.00')
  assert.equal(f.mercid, '247134')
  assert.equal(f.orderid, 'MTN20261028A1B2C3D4')
  assert.deepEqual([f.buyerFirstName, f.buyerLastName, f.buyerPhone], ['Asha', 'Juma Mrisho', '0712345678'])
  assert.deepEqual([f.currency, f.isocurrency], ['834', 'TZS'])
  const alldata = `viewer@example.comAshaJuma Mrisho5000.00MTN20261028A1B2C3D4a1b2c32026-10-28`
  assert.equal(f.checksum, sha(`${sha('user-x~:~pass-y')}@${alldata}`))
  assert.equal(f.privatekey, sha('secret-z@user-x:|:pass-y'))
  const sent = JSON.stringify(f)
  for (const secret of ['user-x', 'pass-y', 'secret-z', sha('user-x~:~pass-y')]) assert.ok(!sent.includes(secret), `form must not carry ${secret}`)
})

test('buyer fields survive hostile or missing input within AirPay\'s rules', () => {
  const b = buyerFrom({ email: 'not-an-email', fullName: '<script>Ω</script>', phone: '+255-712-345-678', orderId: 'MTN1' })
  assert.equal(b.buyerEmail, 'mtn1@mtonyo.app')
  assert.match(b.buyerFirstName, /^[A-Za-z0-9 ]{1,50}$/)
  assert.equal(b.buyerLastName, 'Viewer')
  assert.equal(b.buyerPhone, '255712345678')
  assert.equal(buyerFrom({ email: 'x'.repeat(60) + '@a.co', fullName: '', orderId: 'MTN2' }).buyerEmail, 'mtn2@mtonyo.app')
  assert.equal(buyerFrom({ fullName: 'Zoë Kâmara', orderId: 'MTN3' }).buyerFirstName, 'Zoe')
})

test('responses: JSON, nested JSON, XML, urlencoded, garbage', () => {
  assert.equal(parseAirpayResponse('{"TRANSACTIONSTATUS":200,"AMOUNT":"5000.00"}').TRANSACTIONSTATUS, 200)
  assert.equal(parseAirpayResponse('{"transaction":{"transactionstatus":"211"}}').TRANSACTIONSTATUS, '211')
  assert.equal(parseAirpayResponse('<RESPONSE><TRANSACTION><TRANSACTIONSTATUS>402</TRANSACTIONSTATUS><MESSAGE><![CDATA[Cancel]]></MESSAGE></TRANSACTION></RESPONSE>').MESSAGE, 'Cancel')
  assert.equal(parseAirpayResponse('TRANSACTIONSTATUS=400&MESSAGE=Failed').TRANSACTIONSTATUS, '400')
  for (const junk of ['', 'Internal Server Error', '{broken', '<html><body>502</body></html>', null]) {
    assert.equal(verdictFrom(parseAirpayResponse(junk), PAYMENT).status, null, `"${junk}" is no verdict`)
  }
})

test('every documented status code maps; unknown codes are no verdict', () => {
  const ok = { TRANSACTIONID: PAYMENT.merchant_order_id, AMOUNT: '5000.00', APTRANSACTIONID: '98765' }
  assert.deepEqual(
    Object.keys(STATUS_MAP).map((c) => [c, verdictFrom({ ...ok, TRANSACTIONSTATUS: c }, PAYMENT).status]),
    [['200', 'success'], ['211', 'pending'], ['400', 'failed'], ['401', 'failed'], ['402', 'cancelled'], ['403', 'failed'], ['405', 'failed'], ['503', null]]
  )
  assert.equal(verdictFrom({ ...ok, TRANSACTIONSTATUS: 200 }, PAYMENT).providerTxnId, '98765')
  for (const c of [0, 201, 999, 'SUCCESS', 'Capture', undefined]) assert.equal(verdictFrom({ ...ok, TRANSACTIONSTATUS: c }, PAYMENT).status, null)
})

test('a 200 for another order or another amount never unlocks', () => {
  const base = { TRANSACTIONSTATUS: 200, APTRANSACTIONID: '1' }
  assert.equal(verdictFrom({ ...base, TRANSACTIONID: PAYMENT.merchant_order_id, AMOUNT: '500.00' }, PAYMENT).status, null)
  assert.equal(verdictFrom({ ...base, TRANSACTIONID: 'MTN-SOMEONE-ELSE', AMOUNT: '5000.00' }, PAYMENT).status, null)
  assert.equal(verdictFrom({ ...base, TRANSACTIONID: PAYMENT.merchant_order_id }, PAYMENT).status, null, 'no amount, no unlock')
  assert.equal(verdictFrom({ ...base, TRANSACTIONID: PAYMENT.merchant_order_id, AMOUNT: '5000' }, PAYMENT).status, 'success')
})

async function fakeAirpay(handler) {
  const seen = []
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => { seen.push(Object.fromEntries(new URLSearchParams(body))); handler(req, res) })
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  return { url: `http://127.0.0.1:${server.address().port}/order/verify.php`, seen, close: () => new Promise((r) => server.close(r)) }
}

test('verifyOrder over real HTTP: signed request, verified success', async () => {
  const gw = await fakeAirpay((_q, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ TRANSACTIONID: PAYMENT.merchant_order_id, APTRANSACTIONID: 4324324, AMOUNT: '5000.00', TRANSACTIONSTATUS: 200, MESSAGE: 'Success' })) })
  try {
    const now = new Date('2026-10-28T10:00:00Z')
    const v = await verifyOrder(PAYMENT, { cfg: { ...CFG, verifyUrl: gw.url }, now })
    assert.deepEqual([v.status, v.providerTxnId], ['success', '4324324'])
    const sent = gw.seen[0]
    assert.equal(sent.mercid, '247134')
    assert.equal(sent.merchant_txnId, PAYMENT.merchant_order_id)
    assert.equal(sent.checksum, sha(`${sha('user-x~:~pass-y')}@247134${PAYMENT.merchant_order_id}2026-10-28`))
    assert.ok(!JSON.stringify(sent).includes('pass-y') && !JSON.stringify(sent).includes('secret-z'))
  } finally { await gw.close() }
})

test('verifyOrder: gateway down, HTTP 500, or a hang is an error — never a verdict', async () => {
  const down = verifyOrder(PAYMENT, { cfg: { ...CFG, verifyUrl: 'http://127.0.0.1:9/verify' } })
  await assert.rejects(down)
  const err = await fakeAirpay((_q, res) => { res.statusCode = 500; res.end('oops') })
  try { await assert.rejects(verifyOrder(PAYMENT, { cfg: { ...CFG, verifyUrl: err.url } }), /HTTP 500/) } finally { await err.close() }
  const hang = await fakeAirpay(() => {})
  try { await assert.rejects(verifyOrder(PAYMENT, { cfg: { ...CFG, verifyUrl: hang.url, timeoutMs: 300 } })) } finally { hang.close() }
  await assert.rejects(verifyOrder(PAYMENT, { cfg: { ...CFG, password: '' } }), /AIRPAY_PASSWORD/)
  assert.deepEqual(missingAirpayConfig({ ...CFG, merchantId: '', secret: '' }), ['merchantId', 'secret'])
})

test('callbacks name an order only; AP_SECUREHASH is checked, not trusted', () => {
  const plain = { signed: null, invalid: false }
  assert.deepEqual(orderFromCallback({ TRANSACTIONID: 'MTN1', APTRANSACTIONID: 77, TRANSACTIONSTATUS: 200 }, CFG), { orderId: 'MTN1', providerRef: '77', ...plain })
  assert.deepEqual(orderFromCallback({ transactionid: 'MTN2' }, CFG), { orderId: 'MTN2', providerRef: null, ...plain })
  assert.deepEqual(orderFromCallback({}, CFG), { orderId: null, providerRef: null, ...plain })
  const body = { TRANSACTIONID: 'MTN1', APTRANSACTIONID: '77', AMOUNT: '5000.00', TRANSACTIONSTATUS: '200', MESSAGE: 'Success' }
  const good = String(crc32(`MTN1:77:5000.00:200:Success:247134:user-x`))
  assert.equal(secureHashMatches({ ...body, AP_SECUREHASH: good }, CFG), true)
  assert.equal(secureHashMatches({ ...body, AP_SECUREHASH: '123' }, CFG), false)
  assert.equal(secureHashMatches(body, CFG), null)
})

test('routes: AirPay callbacks and returns only trigger verification; the return goes to our own site', () => {
  const routes = readFileSync(new URL('./payments.routes.js', import.meta.url), 'utf8')
  const ret = routes.slice(routes.indexOf("'/return/:provider'"), routes.indexOf('/* ------------------------------------------------------------ sandbox aid'))
  assert.match(ret, /reconcilePayment\(payment, \{ via: 'return', signed: ref\.signed \|\| null \}\)/)
  assert.doesNotMatch(ret, /settlePayment\(/)
  assert.match(ret, /const home = env\.publicWebUrl/)
  assert.doesNotMatch(ret, /redirect\(303, (req|ref)\./, 'never redirect to a URL from the request')
  const provider = readFileSync(new URL('./provider.js', import.meta.url), 'utf8')
  assert.doesNotMatch(provider, /log\.\w+\([^)]*(privatekey|checksum|password|secret)/i, 'no secret or hash in a log line')
})
