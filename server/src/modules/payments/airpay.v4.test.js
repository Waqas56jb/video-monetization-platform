/**
 * AirPay Tanzania v4 (OAuth token + encrypted payloads), against AirPay's own
 * kits (ma.airpay.tz/kits/tz/v4) and the answers the real sandbox gave on
 * 2026-10-30. A fake gateway speaks the protocol over real HTTP.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import http from 'node:http'
import {
  crc32, parseAirpayResponse, verdictFrom, orderFromCallback, missingAirpayConfig, checkoutRequest,
  airpayConfig, v4Key, encryptV4, decryptV4, checksumV4, accessToken, verifyOrderV4, verifyAirpay, fieldsFromV4, _forgetTokens,
} from './airpay.js'

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex')
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex')
const CFG = {
  version: 'v3', merchantId: '247134', username: 'user-x', password: 'pass-y', secret: 'secret-z',
  payUrl: 'https://payments.airpay.tz/pay/index.php', verifyUrl: 'http://127.0.0.1:9/verify',
  currency: '834', isoCurrency: 'TZS', chmod: '', timeZone: 'Asia/Kolkata', timeoutMs: 2000,
}
const V4 = { ...CFG, version: 'v4', clientId: 'cid-1', clientSecret: 'csecret-2', tokenUrl: 'http://127.0.0.1:9/oauth2/', verifyUrlV4: 'http://127.0.0.1:9/verify/', sandbox: false }
const KEY = md5('user-x~:~pass-y')
const PAYMENT = { id: 'p1', merchant_order_id: 'MTN20261030A1B2C3D4', provider_ref: null, amount_tzs: 5000 }

/** The reference decryption, written the way AirPay's PHP kit does it. */
function phpDecrypt(data, key) {
  const d = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key), Buffer.from(data.substr(0, 16)))
  return Buffer.concat([d.update(Buffer.from(data.substr(16), 'base64')), d.final()]).toString()
}
const hashFor = (f, cfg = V4) => String(crc32([f.orderid, f.ap_transactionid, f.amount, f.transaction_status, f.message, cfg.merchantId, cfg.username].join(':')))
const airpayReply = (data, key = KEY) => encryptV4(JSON.stringify({ status_code: '200', status: 'success', data }), key)
const SUCCESS = { orderid: PAYMENT.merchant_order_id, ap_transactionid: '777', amount: '5000.00', transaction_status: '200', message: 'Success' }
const signedReply = (data) => ({ response: airpayReply({ ...data, ap_securehash: hashFor(data) }) })

test('config: v4 is chosen by the client id/secret pair, forced by AIRPAY_API_VERSION, and needs both', () => {
  assert.equal(airpayConfig({ ...CFG, clientId: 'a', clientSecret: 'b' }).version, 'v4')
  assert.equal(airpayConfig({ ...CFG, clientId: 'a' }).version, 'v3', 'half a pair is not v4')
  assert.equal(airpayConfig({ ...CFG, clientId: 'a', clientSecret: 'b', apiVersion: 'v3' }).version, 'v3')
  assert.equal(airpayConfig({ ...CFG, apiVersion: 'v4' }).version, 'v4')
  assert.equal(airpayConfig({ ...CFG, apiVersion: 'v9' }).version, 'v3', 'an unknown version falls back')
  assert.equal(airpayConfig({ ...CFG, payUrl: '', clientId: 'a', clientSecret: 'b' }).payUrl, 'https://payments.airpay.tz/pay/v1/index.php')
  assert.equal(airpayConfig({ ...CFG, clientId: 'a', clientSecret: 'b' }).payUrl, CFG.payUrl, 'AIRPAY_PAY_URL always wins')
  assert.equal(airpayConfig({ ...CFG, payUrl: '' }).payUrl, 'https://payments.airpay.tz/pay/index.php')
  assert.equal(airpayConfig({ ...CFG }).sandbox, false, 'sandbox only when said so')
  assert.equal(airpayConfig({ ...CFG, sandbox: 'true' }).sandbox, true)
  assert.equal(airpayConfig({ ...CFG, sandbox: 'yes' }).sandbox, false)
  assert.equal(airpayConfig({ ...CFG, timeZone: '' }).timeZone, 'Asia/Kolkata', 'AirPay kits date checksums in India time')
  assert.deepEqual(missingAirpayConfig({ ...V4, clientSecret: '' }), ['clientSecret'])
  assert.deepEqual(missingAirpayConfig(V4), [])
})

test('crypto matches AirPay\'s kit: md5 key, 16-char iv prefix, AES-256-CBC, sorted checksum', () => {
  assert.equal(v4Key(CFG), KEY)
  const enc = encryptV4('{"a":"Ω ✓ 1"}', KEY, '0123456789abcdef')
  assert.ok(enc.startsWith('0123456789abcdef'))
  assert.equal(phpDecrypt(enc, KEY), '{"a":"Ω ✓ 1"}')
  assert.equal(decryptV4(enc, KEY), '{"a":"Ω ✓ 1"}')
  assert.notEqual(encryptV4('x', KEY), encryptV4('x', KEY), 'a fresh iv every time')
  for (const bad of ['', 'short', 'x'.repeat(40), enc.slice(0, -4) + 'AAAA', null, undefined]) {
    assert.throws(() => decryptV4(bad, KEY), `rejects ${String(bad).slice(0, 10)}`)
  }
  assert.throws(() => decryptV4(enc, md5('other')), 'another key does not open it')
  const late = new Date('2026-10-30T20:00:00Z') // 01:30 on the 31st in India
  assert.equal(checksumV4({ b: '2', a: '1', c: null }, late), sha('122026-10-31'))
  assert.equal(checksumV4({}, late), sha('2026-10-31'))
})

async function fakeV4(routes) {
  const seen = []
  const server = http.createServer((req, res) => {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      const form = Object.fromEntries(new URLSearchParams(body))
      seen.push({ path: req.url, form })
      const handler = routes[req.url.split('?')[0]] || ((_f, r) => { r.statusCode = 404; r.end('no') })
      handler(form, res, req)
    })
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  return { base: `http://127.0.0.1:${server.address().port}`, seen, close: () => new Promise((r) => server.close(r)) }
}
const json = (res, body) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(body)) }
const tokenRoute = (token = 'tok-123', expires = 300) => (form, res) => {
  const req = JSON.parse(phpDecrypt(form.encdata, KEY))
  const ok = req.client_id === 'cid-1' && req.client_secret === 'csecret-2' && req.grant_type === 'client_credentials' && form.merchant_id === '247134'
  json(res, { response: encryptV4(JSON.stringify(ok ? { status_code: '200', data: { access_token: token, expires_in: expires } } : { status_code: '400', message: 'Invalid client id or secret' }), KEY) })
}

test('token: encrypted request, decrypted answer, cached until near expiry; every refusal is an error', async () => {
  _forgetTokens()
  const gw = await fakeV4({ '/oauth2/': tokenRoute() })
  try {
    const cfg = { ...V4, tokenUrl: `${gw.base}/oauth2/` }
    const now = new Date('2026-10-30T10:00:00Z')
    assert.equal(await accessToken({ cfg, now }), 'tok-123')
    assert.equal(await accessToken({ cfg, now: new Date(now.getTime() + 60_000) }), 'tok-123')
    assert.equal(gw.seen.length, 1, 'the second call is served from cache')
    assert.equal(gw.seen[0].form.checksum, checksumV4({ client_id: 'cid-1', client_secret: 'csecret-2', grant_type: 'client_credentials', merchant_id: '247134' }, now))
    assert.ok(!JSON.stringify(gw.seen[0].form).includes('csecret-2'), 'the client secret only travels encrypted')
    await accessToken({ cfg, now: new Date(now.getTime() + 290_000) })
    assert.equal(gw.seen.length, 2, 'renewed before it expires')
    _forgetTokens()
    await assert.rejects(accessToken({ cfg: { ...cfg, clientSecret: 'wrong' }, now }), /Invalid client id or secret/)
  } finally { await gw.close() }

  // what the real sandbox answered on 2026-10-30
  const denied = await fakeV4({ '/oauth2/': (_f, res) => { res.statusCode = 403; res.end('\n\n403 Forbidden: Access is denied. Invalid request') } })
  try { _forgetTokens(); await assert.rejects(accessToken({ cfg: { ...V4, tokenUrl: `${denied.base}/oauth2/` } }), /HTTP 403: 403 Forbidden: Access is denied/) } finally { await denied.close() }
  const html = await fakeV4({ '/oauth2/': (_f, res) => res.end('<html>maintenance</html>') })
  try { _forgetTokens(); await assert.rejects(accessToken({ cfg: { ...V4, tokenUrl: `${html.base}/oauth2/` } }), /AirPay answered/) } finally { await html.close() }
  const noToken = await fakeV4({ '/oauth2/': (_f, res) => json(res, { response: encryptV4('{"status_code":"200","data":{}}', KEY) }) })
  try { _forgetTokens(); await assert.rejects(accessToken({ cfg: { ...V4, tokenUrl: `${noToken.base}/oauth2/` } }), /no token/) } finally { await noToken.close() }
  const hang = await fakeV4({ '/oauth2/': () => {} })
  try { _forgetTokens(); await assert.rejects(accessToken({ cfg: { ...V4, tokenUrl: `${hang.base}/oauth2/`, timeoutMs: 300 } })) } finally { hang.close() }
  _forgetTokens()
  await assert.rejects(accessToken({ cfg: V4 }), 'gateway down')
})

test('checkout: token in the URL, order encrypted, no credential in anything the browser receives', async () => {
  _forgetTokens()
  const gw = await fakeV4({ '/oauth2/': tokenRoute('tok-abc') })
  try {
    const cfg = { ...V4, tokenUrl: `${gw.base}/oauth2/`, payUrl: 'https://payments.airpay.tz/pay/v1/index.php' }
    const now = new Date('2026-10-30T10:00:00Z')
    const r = await checkoutRequest({ cfg, now, orderId: 'MTN20261030AAAA0001', amountTzs: 5000, email: 'v@example.com', fullName: 'Asha Juma', phone: '0712 345 678', method: 'airtel' })
    assert.equal(r.url, 'https://payments.airpay.tz/pay/v1/index.php?token=tok-abc')
    assert.equal(r.method, 'POST')
    assert.deepEqual(Object.keys(r.fields).sort(), ['checksum', 'chmod', 'encdata', 'merchant_id', 'privatekey'])
    const data = JSON.parse(phpDecrypt(r.fields.encdata, KEY))
    assert.deepEqual(
      [data.orderid, data.amount, data.buyer_phone, data.buyer_firstname, data.buyer_lastname, data.iso_currency, data.currency_code, data.merchant_id],
      ['MTN20261030AAAA0001', '5000.00', '0712345678', 'Asha', 'Juma', 'TZS', '834', '247134'])
    assert.equal(r.fields.checksum, checksumV4(data, now))
    assert.equal(r.fields.privatekey, sha('secret-z@user-x:|:pass-y'))
    const sent = JSON.stringify(r)
    for (const s of ['user-x', 'pass-y', 'secret-z', 'csecret-2', KEY]) assert.ok(!sent.includes(s), `the browser never sees ${s}`)
    // hostile buyer details stay inside AirPay's field rules
    const h = await checkoutRequest({ cfg, now, orderId: 'MTN2', amountTzs: 1, email: '<x>', fullName: '"><script>', phone: 'abc' })
    const hd = JSON.parse(phpDecrypt(h.fields.encdata, KEY))
    assert.equal(hd.buyer_email, 'mtn2@mtonyo.app')
    assert.match(hd.buyer_firstname, /^[A-Za-z0-9 ]+$/)
    assert.equal(hd.amount, '1.00')
  } finally { await gw.close() }
  _forgetTokens()
  await assert.rejects(checkoutRequest({ cfg: V4, orderId: 'MTN3', amountTzs: 1000 }), 'no token, no checkout (the provider turns this into a 503: nothing charged)')
  const v3 = await checkoutRequest({ cfg: CFG, orderId: 'MTN1', amountTzs: 1000, email: 'v@example.com', fullName: 'A B' })
  assert.deepEqual([v3.url, v3.fields.mercid, v3.fields.amount], [CFG.payUrl, '247134', '1000.00'], 'v3 stays available')
})

test('verify: success for this order and amount only; other answers are a status or no verdict', async () => {
  _forgetTokens()
  let answer = null
  const gw = await fakeV4({
    '/oauth2/': tokenRoute(),
    '/verify/': (form, res, req) => {
      assert.match(req.url, /\?token=tok-123$/)
      assert.equal(JSON.parse(phpDecrypt(form.encdata, KEY)).orderid, PAYMENT.merchant_order_id)
      assert.equal(form.privatekey, sha('secret-z@user-x:|:pass-y'))
      json(res, { response: encryptV4(JSON.stringify(answer), KEY) })
    },
  })
  const cfg = { ...V4, tokenUrl: `${gw.base}/oauth2/`, verifyUrlV4: `${gw.base}/verify/` }
  const status = async (data, extra = {}) => { answer = { status_code: '200', data, ...extra }; return (await verifyOrderV4(PAYMENT, { cfg })).status }
  try {
    answer = { status_code: '200', data: { ...SUCCESS, transaction_status: 200 } }
    const ok = await verifyOrderV4(PAYMENT, { cfg })
    assert.deepEqual([ok.status, ok.providerTxnId], ['success', '777'])
    assert.equal(await status({ ...SUCCESS, transaction_status: 402, message: 'Cancel' }), 'cancelled')
    assert.equal(await status({ ...SUCCESS, transaction_status: 400, message: 'Failed' }), 'failed')
    assert.equal(await status({ ...SUCCESS, transaction_status: 405 }), 'failed')
    assert.equal(await status({ ...SUCCESS, transaction_status: 211 }), 'pending')
    assert.equal(await status({ ...SUCCESS, transaction_status: 503 }), null)
    assert.equal(await status({ ...SUCCESS, transaction_status: 200, amount: '50.00' }), null, 'wrong amount')
    assert.equal(await status({ ...SUCCESS, transaction_status: 200, amount: '5000.01' }), null, 'off by a cent')
    assert.equal(await status({ ...SUCCESS, transaction_status: 200, orderid: 'MTN-OTHER' }), null, 'another order')
    assert.equal(await status({ ...SUCCESS, transaction_status: 400, orderid: '' }), null, 'a failure naming no order of ours')
    answer = { status_code: '400', response_code: 501, message: 'Invalid Merchant Id', data: [] }
    assert.equal((await verifyOrderV4(PAYMENT, { cfg })).status, null)
    answer = { status_code: '200', data: [] }
    assert.equal((await verifyOrderV4(PAYMENT, { cfg })).status, null)
  } finally { await gw.close() }
})

test('v3 verify: AirPay rejecting OUR request ("Wrong checksum", 400) is never read as the viewer\'s payment failing', () => {
  // the exact answer the real sandbox gave a wrongly keyed request on 2026-10-30
  const real = parseAirpayResponse('<?xml version="1.0"?>\n<RESPONSE><TRANSACTION>\n<TRANSACTIONSTATUS><![CDATA[400]]></TRANSACTIONSTATUS><MESSAGE><![CDATA[Wrong checksum]]></MESSAGE></TRANSACTION></RESPONSE>')
  assert.equal(real.TRANSACTIONSTATUS, '400')
  const v = verdictFrom(real, PAYMENT)
  assert.deepEqual([v.status, v.raw.unattributed], [null, true])
  const notFound = parseAirpayResponse('<RESPONSE><TRANSACTION><TRANSACTIONSTATUS><![CDATA[503]]></TRANSACTIONSTATUS><MESSAGE><![CDATA[Transaction details not available]]></MESSAGE><TRANSACTIONID><![CDATA[]]></TRANSACTIONID></TRANSACTION></RESPONSE>')
  assert.equal(verdictFrom(notFound, PAYMENT).status, null)
  assert.equal(verdictFrom({ TRANSACTIONSTATUS: 200, AMOUNT: '5000.00', APTRANSACTIONID: '1' }, PAYMENT).status, null, 'a success naming no order never unlocks')
  assert.equal(verdictFrom({ TRANSACTIONSTATUS: 402, TRANSACTIONID: PAYMENT.merchant_order_id }, PAYMENT).status, 'cancelled', 'a real failure of ours still counts')
})

test('callback: our encrypted reply is opened and hash-checked; forged or corrupted ones are refused', () => {
  const r = orderFromCallback(signedReply(SUCCESS), V4)
  assert.deepEqual([r.orderId, r.providerRef, r.invalid, r.signed.TRANSACTIONSTATUS], [PAYMENT.merchant_order_id, '777', false, '200'])
  const badHash = orderFromCallback({ response: airpayReply({ ...SUCCESS, ap_securehash: '1' }) }, V4)
  assert.deepEqual([badHash.orderId, badHash.signed, badHash.invalid], [PAYMENT.merchant_order_id, null, false], 'names the order, carries no evidence')
  const noHash = orderFromCallback({ response: airpayReply(SUCCESS) }, V4)
  assert.equal(noHash.signed, null)
  const otherKey = orderFromCallback({ response: airpayReply(SUCCESS, md5('attacker')) }, V4)
  assert.deepEqual([otherKey.orderId, otherKey.signed, otherKey.invalid], [null, null, true])
  for (const junk of ['', 'abc', 'x'.repeat(64), '{"orderid":"MTN"}', 'A'.repeat(5000)]) {
    assert.equal(orderFromCallback({ response: junk }, V4).invalid, junk !== '', `junk "${junk.slice(0, 8)}"`)
  }
  const notJson = orderFromCallback({ response: encryptV4('not json', KEY) }, V4)
  assert.equal(notJson.invalid, true)
  assert.equal(orderFromCallback({ RESPONSE: signedReply(SUCCESS).response }, V4).signed.APTRANSACTIONID, '777', 'field name case does not matter')
  const flat = orderFromCallback({ response: encryptV4(JSON.stringify({ ...SUCCESS, ap_securehash: hashFor(SUCCESS) }), KEY) }, V4)
  assert.equal(flat.signed?.TRANSACTIONID, PAYMENT.merchant_order_id, 'a payload without the data wrapper is read too')
  assert.equal(orderFromCallback({ response: airpayReply({ ...SUCCESS, orderid: 'X'.repeat(500), ap_securehash: '0' }) }, V4).orderId.length, 40, 'ids are bounded')
  assert.equal(fieldsFromV4({ orderid: 'A', ap_SecureHash: '9', transaction_status: 0 }).AP_SECUREHASH, '9')
})

test('verifyAirpay: a live merchant is settled by the API alone; a sandbox may use AirPay\'s signed reply, checked', async () => {
  _forgetTokens()
  const down = { ...V4 } // every AirPay endpoint unreachable
  const signed = orderFromCallback(signedReply(SUCCESS), V4).signed
  await assert.rejects(verifyAirpay(PAYMENT, { cfg: down, signed }), 'live: the signed reply is not enough — the error surfaces, nothing unlocks')
  const sb = await verifyAirpay(PAYMENT, { cfg: { ...down, sandbox: true }, signed })
  assert.deepEqual([sb.status, sb.providerTxnId, sb.raw.source], ['success', '777', 'airpay-signed-return (sandbox)'])
  const cheap = orderFromCallback(signedReply({ ...SUCCESS, amount: '100.00' }), V4).signed
  await assert.rejects(verifyAirpay(PAYMENT, { cfg: { ...down, sandbox: true }, signed: cheap }), 'sandbox: a signed success for another amount does not unlock')
  const other = orderFromCallback(signedReply({ ...SUCCESS, orderid: 'MTN-SOMEONE-ELSE' }), V4).signed
  await assert.rejects(verifyAirpay(PAYMENT, { cfg: { ...down, sandbox: true }, signed: other }), 'sandbox: another order\'s success does not unlock this one')
  const failed = orderFromCallback(signedReply({ ...SUCCESS, transaction_status: '400', message: 'Failed' }), V4).signed
  assert.equal((await verifyAirpay(PAYMENT, { cfg: { ...down, sandbox: true }, signed: failed })).status, 'failed')
  const pending = orderFromCallback(signedReply({ ...SUCCESS, transaction_status: '211', message: 'In process' }), V4).signed
  await assert.rejects(verifyAirpay(PAYMENT, { cfg: { ...down, sandbox: true }, signed: pending }), 'pending is never a settlement')
  await assert.rejects(verifyAirpay(PAYMENT, { cfg: { ...down, sandbox: true }, signed: null }), 'no evidence, API down: an error, never a verdict')
  await assert.rejects(verifyAirpay(PAYMENT, { cfg: { ...V4, clientId: '' } }), /AIRPAY_CLIENT_ID/)
})
