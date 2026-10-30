import crypto from 'node:crypto'
import { env } from '../../config/env.js'
import { log } from '../../lib/logger.js'
import { serviceUnavailable } from '../../lib/errors.js'

/**
 * AirPay Tanzania — hosted checkout + server-side order verification.
 *
 * Built from AirPay Tanzania's published API reference (sanctum.airpay.tz,
 * "Simple Transaction", "Order Confirmation", "IPN Callback"):
 *
 *   1. initiate  → a signed form the viewer's browser posts to AirPay's hosted
 *                  page (payments.airpay.tz/pay/index.php), where they choose
 *                  M-Pesa / Airtel Money and approve on their phone.
 *   2. AirPay sends the browser back to our return URL and POSTs an IPN to our
 *      callback URL. NEITHER is trusted: both only trigger step 3.
 *   3. verify    → our server asks AirPay (order/verify.php) what happened to
 *                  the order. Only that answer can unlock a video.
 *
 * Secrets: username, password and secret stay on the server. What reaches the
 * browser is what AirPay's own kits put in the hosted form — the merchant id,
 * the order, and two one-way SHA-256 hashes (privatekey, checksum). Neither
 * hash is ever logged.
 *
 * Every URL and the currency are configurable (AIRPAY_* env), because AirPay
 * issues different hosts per country / API version.
 */

/* --------------------------------------------------------------- formulas */

const sha256 = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex')

/** privatekey = sha256(secret@username:|:password) */
export const privateKeyFor = ({ secret, username, password }) => sha256(`${secret}@${username}:|:${password}`)

/** key = sha256(username~:~password) — the checksum key, never sent anywhere. */
export const checksumKeyFor = ({ username, password }) => sha256(`${username}~:~${password}`)

/** checksum = sha256(key@alldata) */
export const checksumOf = (key, alldata) => sha256(`${key}@${alldata}`)

/** AirPay's checksum date, YYYY-MM-DD. Its kits (Tanzania included) compute it in India time. */
export function airpayDate(now = new Date(), timeZone = 'Asia/Kolkata') {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/* CRC32 (IEEE), for AP_SECUREHASH. Kept local: zlib.crc32 is Node ≥ 22.2. */
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
export function crc32(str) {
  let c = 0xffffffff
  for (const b of Buffer.from(String(str), 'utf8')) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/* ----------------------------------------------------------------- config */

export function airpayConfig(a = env.payments.airpay) {
  // v4 (OAuth + encrypted payloads) whenever the client id/secret pair is
  // configured; AIRPAY_API_VERSION forces either.
  const version = a.apiVersion === 'v3' || a.apiVersion === 'v4' ? a.apiVersion : a.clientId && a.clientSecret ? 'v4' : 'v3'
  return {
    version,
    merchantId: a.merchantId,
    username: a.username,
    password: a.password,
    secret: a.secret,
    clientId: a.clientId,
    clientSecret: a.clientSecret,
    payUrl: a.payUrl || (version === 'v4' ? 'https://payments.airpay.tz/pay/v1/index.php' : 'https://payments.airpay.tz/pay/index.php'),
    verifyUrl: a.verifyUrl || 'https://payments.airpay.tz/order/verify.php',
    tokenUrl: a.tokenUrl || 'https://kraken.airpay.tz/airpay/pay/v1/api/oauth2/',
    verifyUrlV4: a.verifyUrlV4 || 'https://kraken.airpay.tz/airpay/pay/v1/api/verify/',
    // AirPay's order-confirmation API does not answer for sandbox merchants;
    // only then may AirPay's own encrypted reply stand in for it (see below).
    sandbox: a.sandbox === true || a.sandbox === 'true',
    currency: a.currency || '834',
    isoCurrency: a.isoCurrency || 'TZS',
    chmod: a.chmod ?? '',
    timeZone: a.timeZone || 'Asia/Kolkata',
    timeoutMs: Number(a.timeoutMs || 15000),
  }
}

export function missingAirpayConfig(cfg = airpayConfig()) {
  const need = ['merchantId', 'username', 'password', 'secret']
  if (cfg.version === 'v4') need.push('clientId', 'clientSecret')
  return need.filter((k) => !cfg[k])
}

/* -------------------------------------------------------------------- v4 */
/*
 * AirPay Tanzania v4, as its official kits (ma.airpay.tz/kits/tz/v4) do it:
 *   key      = md5(username~:~password), used as a 32-byte AES-256 key
 *   encdata  = iv + base64(AES-256-CBC(json)), iv = 16 random hex characters
 *   checksum = sha256(values sorted by key, concatenated, + YYYY-MM-DD)
 * The client id/secret buy a short-lived access token (OAuth2 client
 * credentials); every later request carries it in `?token=`.
 */

const md5 = (s) => crypto.createHash('md5').update(String(s), 'utf8').digest('hex')

/** The AES key of every v4 payload. Never sent, never logged. */
export const v4Key = ({ username, password }) => md5(`${username}~:~${password}`)

export function encryptV4(text, key, iv = crypto.randomBytes(8).toString('hex')) {
  const c = crypto.createCipheriv('aes-256-cbc', Buffer.from(key, 'utf8'), Buffer.from(iv, 'utf8'))
  return iv + Buffer.concat([c.update(String(text), 'utf8'), c.final()]).toString('base64')
}

/** Throws on anything that is not a payload encrypted with our key. */
export function decryptV4(data, key) {
  const s = String(data || '')
  if (s.length < 32) throw new Error('not an AirPay payload')
  const d = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key, 'utf8'), Buffer.from(s.slice(0, 16), 'utf8'))
  return Buffer.concat([d.update(Buffer.from(s.slice(16), 'base64')), d.final()]).toString('utf8')
}

export function checksumV4(obj, now = new Date(), timeZone = 'Asia/Kolkata') {
  const values = Object.keys(obj).sort().map((k) => obj[k] ?? '').join('')
  return sha256(`${values}${airpayDate(now, timeZone)}`)
}

async function postForm(url, fields, { cfg, fetchImpl = fetch }) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs)
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
      body: new URLSearchParams(fields).toString(),
      signal: ctrl.signal,
    })
    return { status: res.status, text: await res.text() }
  } finally {
    clearTimeout(timer)
  }
}

/** A v4 answer is `{"response":"<encrypted json>"}`; anything else is an error page. */
function openV4(text, key) {
  let outer
  try { outer = JSON.parse(text) } catch { throw new Error(`AirPay answered ${String(text).replace(/\s+/g, ' ').trim().slice(0, 80) || 'nothing'}`) }
  if (!outer?.response) throw new Error(`AirPay answered ${String(outer?.message || 'no payload').slice(0, 80)}`)
  return JSON.parse(decryptV4(outer.response, key))
}

const tokens = new Map() // merchantId → { token, expiresAt }

export async function accessToken({ cfg = airpayConfig(), fetchImpl = fetch, now = new Date() } = {}) {
  const cached = tokens.get(cfg.merchantId)
  if (cached && cached.expiresAt > now.getTime() + 30_000) return cached.token
  const request = { client_id: cfg.clientId, client_secret: cfg.clientSecret, grant_type: 'client_credentials', merchant_id: String(cfg.merchantId) }
  const key = v4Key(cfg)
  const res = await postForm(cfg.tokenUrl, {
    merchant_id: String(cfg.merchantId),
    encdata: encryptV4(JSON.stringify(request), key),
    checksum: checksumV4(request, now, cfg.timeZone),
  }, { cfg, fetchImpl })
  if (res.status !== 200) throw new Error(`AirPay token request refused (HTTP ${res.status}: ${res.text.replace(/\s+/g, ' ').trim().slice(0, 80)})`)
  const body = openV4(res.text, key)
  const token = body?.data?.access_token
  if (!token) throw new Error(`AirPay token request failed: ${String(body?.message || 'no token').slice(0, 80)}`)
  const ttl = Math.max(60, Number(body.data.expires_in) || 300) * 1000
  tokens.set(cfg.merchantId, { token, expiresAt: now.getTime() + ttl })
  return token
}
export const _forgetTokens = () => tokens.clear()

/* -------------------------------------------------------------- checkout */

/* AirPay's field rules: names alphanumeric/space 1-50, phone digits 8-15,
   email 6-50, order id alphanumeric 1-25, amount with two decimals. */
const alnum = (s, max) => String(s || '').normalize('NFKD').replace(/[^A-Za-z0-9 ]/g, '').replace(/\s+/g, ' ').trim().slice(0, max)

export function buyerFrom({ email, fullName, phone, orderId }) {
  const parts = alnum(fullName, 100).split(' ').filter(Boolean)
  const first = alnum(parts[0], 50) || 'MTONYO'
  const last = alnum(parts.slice(1).join(' '), 50) || 'Viewer'
  // Digits as the viewer typed them (AirPay: numeric, 8-15); its hosted page
  // confirms the number before charging.
  const digits = String(phone || '').replace(/\D/g, '')
  const mail = String(email || '').trim()
  return {
    buyerEmail: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail) && mail.length >= 6 && mail.length <= 50 ? mail : `${orderId.toLowerCase()}@mtonyo.app`,
    buyerFirstName: first,
    buyerLastName: last,
    buyerPhone: digits.slice(0, 15),
  }
}

export function checkoutForm({ cfg = airpayConfig(), orderId, amountTzs, userId, email, fullName, phone, method, now = new Date() }) {
  const buyer = buyerFrom({ email, fullName, phone, orderId })
  const amount = Number(amountTzs).toFixed(2)
  const UID = String(userId || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 40) || orderId
  // buyerAddress/City/State/Country are optional and sent empty; they still
  // take their (empty) place in the checksum string, as AirPay defines it.
  const address = { buyerAddress: '', buyerCity: '', buyerState: '', buyerCountry: '' }
  const alldata = [
    buyer.buyerEmail, buyer.buyerFirstName, buyer.buyerLastName,
    address.buyerAddress, address.buyerCity, address.buyerState, address.buyerCountry,
    amount, orderId, UID, /* siindexvar: no subscription */ '', airpayDate(now, cfg.timeZone),
  ].join('')
  return {
    ...buyer,
    ...address,
    buyerPinCode: '',
    orderid: orderId,
    amount,
    UID,
    privatekey: privateKeyFor(cfg),
    mercid: String(cfg.merchantId),
    chmod: cfg.chmod,
    checksum: checksumOf(checksumKeyFor(cfg), alldata),
    currency: String(cfg.currency),
    isocurrency: cfg.isoCurrency,
    customvar: method ? `method=${method}` : '',
  }
}

/**
 * The hosted checkout to send the viewer to: v3 posts the order in the clear
 * with two hashes; v4 posts it encrypted, to a URL carrying a fresh token.
 */
export async function checkoutRequest({ cfg = airpayConfig(), fetchImpl = fetch, now = new Date(), ...order }) {
  if (cfg.version !== 'v4') return { url: cfg.payUrl, method: 'POST', fields: checkoutForm({ cfg, now, ...order }) }
  const b = buyerFrom({ email: order.email, fullName: order.fullName, phone: order.phone, orderId: order.orderId })
  const data = {
    buyer_email: b.buyerEmail, buyer_phone: b.buyerPhone, buyer_firstname: b.buyerFirstName, buyer_lastname: b.buyerLastName,
    buyer_address: '', buyer_city: '', buyer_state: '', buyer_pincode: '', buyer_country: '',
    amount: Number(order.amountTzs).toFixed(2), orderid: order.orderId,
    currency: String(cfg.currency), currency_code: String(cfg.currency), iso_currency: cfg.isoCurrency,
    merchant_id: String(cfg.merchantId),
  }
  const token = await accessToken({ cfg, fetchImpl, now })
  return {
    url: `${cfg.payUrl}?token=${encodeURIComponent(token)}`,
    method: 'POST',
    fields: {
      privatekey: privateKeyFor(cfg),
      merchant_id: String(cfg.merchantId),
      checksum: checksumV4(data, now, cfg.timeZone),
      encdata: encryptV4(JSON.stringify(data), v4Key(cfg)),
      chmod: cfg.chmod,
    },
  }
}

/* ---------------------------------------------------------------- verify */

/**
 * AirPay answers JSON in its docs and XML from some hosts; accept both, plus
 * a urlencoded body. Keys are upper-cased; a nested TRANSACTION node is lifted.
 */
export function parseAirpayResponse(text) {
  const s = String(text || '').trim()
  if (!s) return {}
  const up = (o) => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k.toUpperCase(), v]))
  if (s.startsWith('{') || s.startsWith('[')) {
    try {
      let o = JSON.parse(s)
      if (Array.isArray(o)) o = o[0]
      o = up(o)
      for (const k of ['TRANSACTION', 'DATA', 'RESPONSE']) if (o[k] && typeof o[k] === 'object') o = { ...o, ...up(Array.isArray(o[k]) ? o[k][0] : o[k]) }
      return o
    } catch { /* fall through */ }
  }
  if (s.startsWith('<')) {
    const out = {}
    for (const m of s.matchAll(/<([A-Za-z_][\w-]*)>(<!\[CDATA\[[\s\S]*?\]\]>|[^<]*)<\/\1>/g)) out[m[1].toUpperCase()] = m[2].replace(/^<!\[CDATA\[|\]\]>$/g, '').trim()
    return out
  }
  if (s.includes('=')) return up(Object.fromEntries(new URLSearchParams(s)))
  return {}
}

/** AirPay TRANSACTIONSTATUS → our status. null = no verdict yet. */
export const STATUS_MAP = {
  200: { status: 'success' },
  211: { status: 'pending' },
  400: { status: 'failed', failureReason: 'The mobile money payment failed.' },
  401: { status: 'failed', failureReason: 'The payment was dropped before it completed. Nothing was charged.' },
  402: { status: 'cancelled', failureReason: 'The payment was cancelled.' },
  403: { status: 'failed', failureReason: 'The payment was not completed.' },
  405: { status: 'failed', failureReason: 'The payment was declined by the mobile money provider.' },
  503: { status: null }, // no record yet: the viewer has not reached the payment
}

export function verdictFrom(fields, payment) {
  const code = Number(fields.TRANSACTIONSTATUS)
  const mapped = STATUS_MAP[code] || { status: null }
  const providerTxnId = fields.APTRANSACTIONID ? String(fields.APTRANSACTIONID) : null
  const raw = {
    code: Number.isFinite(code) ? code : null,
    message: fields.MESSAGE ? String(fields.MESSAGE).slice(0, 200) : null,
    aptransactionid: providerTxnId,
    orderid: fields.TRANSACTIONID ? String(fields.TRANSACTIONID) : null,
    amount: fields.AMOUNT != null ? String(fields.AMOUNT) : null,
    chmod: fields.CHMOD || null,
    bank: fields.BANKNAME || null,
  }

  /* A failure must name THIS order. AirPay also answers 400 when it rejects
     our request itself ("Wrong checksum", "Invalid Merchant Id") — with no
     transaction id — and that says nothing about the viewer's payment. */
  if (mapped.status && mapped.status !== 'success' && mapped.status !== 'pending' && raw.orderid !== payment.merchant_order_id) {
    log.error(`airpay verify: ${code} "${raw.message}" for ${payment.merchant_order_id} names no transaction of ours — check the AirPay configuration; not a verdict`)
    return { status: null, raw: { ...raw, unattributed: true } }
  }

  if (mapped.status === 'success') {
    /* A success must be for THIS order and THIS amount — a verified success
       for the wrong amount is not a sale of this video. Leave it unresolved
       (no unlock) and shout, so an admin sorts it out with AirPay. */
    const orderOk = raw.orderid === payment.merchant_order_id
    const amountOk = raw.amount != null && Math.abs(Number(raw.amount) - Number(payment.amount_tzs)) < 0.005
    if (!orderOk || !amountOk) {
      log.error(`airpay verify: success for ${payment.merchant_order_id} does not match (order ${raw.orderid}, amount ${raw.amount} vs ${payment.amount_tzs}) — not unlocking`)
      return { status: null, raw: { ...raw, mismatch: true } }
    }
  }
  return { ...mapped, providerTxnId, raw }
}

export async function verifyOrder(payment, { cfg = airpayConfig(), fetchImpl = fetch, now = new Date() } = {}) {
  const missing = missingAirpayConfig(cfg)
  if (missing.length) throw serviceUnavailable(`AirPay is not configured (missing ${missing.map((k) => `AIRPAY_${k.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()}`).join(', ')})`)
  const form = {
    mercid: String(cfg.merchantId),
    merchant_txnId: payment.merchant_order_id || '',
    AirpayId: payment.provider_ref || '',
    terminalId: '',
    txnType: '',
  }
  const alldata = `${form.mercid}${form.merchant_txnId}${form.AirpayId}${form.terminalId}${form.txnType}${airpayDate(now, cfg.timeZone)}`
  const body = new URLSearchParams({ ...form, privatekey: privateKeyFor(cfg), checksum: checksumOf(checksumKeyFor(cfg), alldata) })

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs)
  let res
  try {
    res = await fetchImpl(cfg.verifyUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json, text/xml;q=0.9, */*;q=0.5' },
      body: body.toString(),
      signal: ctrl.signal,
    })
  } finally {
    clearTimeout(timer)
  }
  const text = await res.text()
  if (!res.ok) throw new Error(`AirPay verify answered HTTP ${res.status}`)
  return verdictFrom(parseAirpayResponse(text), payment)
}

/** v4 field names → the v3 names the rest of this module speaks. */
export function fieldsFromV4(d = {}) {
  const pick = (...ks) => { for (const k of ks) if (d[k] != null && d[k] !== '') return d[k]; return undefined }
  return {
    TRANSACTIONID: pick('orderid', 'order_id'),
    APTRANSACTIONID: pick('ap_transactionid'),
    AMOUNT: pick('amount'),
    TRANSACTIONSTATUS: pick('transaction_status'),
    MESSAGE: pick('message'),
    AP_SECUREHASH: pick('ap_securehash', 'ap_SecureHash'),
    CHMOD: pick('chmod'),
    BANKNAME: pick('bank_name'),
    TXNMODE: pick('txn_mode'),
  }
}

/** v4 order confirmation. AirPay documents that it answers for live merchants only. */
export async function verifyOrderV4(payment, { cfg = airpayConfig(), fetchImpl = fetch, now = new Date() } = {}) {
  const token = await accessToken({ cfg, fetchImpl, now })
  const key = v4Key(cfg)
  const data = { orderid: payment.merchant_order_id || '' }
  const res = await postForm(`${cfg.verifyUrlV4}?token=${encodeURIComponent(token)}`, {
    merchant_id: String(cfg.merchantId),
    encdata: encryptV4(JSON.stringify(data), key),
    checksum: checksumV4(data, now, cfg.timeZone),
    privatekey: privateKeyFor(cfg),
  }, { cfg, fetchImpl })
  if (res.status !== 200) throw new Error(`AirPay v4 verify answered HTTP ${res.status}`)
  const body = openV4(res.text, key)
  if (String(body?.status_code) !== '200' || !body?.data || Array.isArray(body.data)) {
    return { status: null, raw: { message: String(body?.message || 'no data').slice(0, 200) } }
  }
  return verdictFrom(fieldsFromV4(body.data), payment)
}

/**
 * The one entry point the provider uses: ask AirPay, and only AirPay.
 *
 * `signed` is AirPay's own encrypted return/IPN payload, already decrypted
 * with our key and with a matching AP_SECUREHASH. It is used ONLY for a
 * sandbox merchant (AIRPAY_SANDBOX=true), whose order-confirmation API
 * AirPay does not serve. A live merchant is settled by the API alone.
 */
export async function verifyAirpay(payment, { signed = null, cfg = airpayConfig(), fetchImpl = fetch, now = new Date() } = {}) {
  const missing = missingAirpayConfig(cfg)
  if (missing.length) throw serviceUnavailable(`AirPay is not configured (missing ${missing.map((k) => `AIRPAY_${k.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()}`).join(', ')})`)
  let verdict = null
  let lastErr = null
  for (const ask of cfg.version === 'v4' ? [verifyOrderV4, verifyOrder] : [verifyOrder]) {
    try {
      verdict = await ask(payment, { cfg, fetchImpl, now })
      if (verdict?.status) return verdict
    } catch (err) {
      lastErr = err
    }
  }
  if (cfg.sandbox && signed) {
    const v = verdictFrom(signed, payment)
    if (v.status && v.status !== 'pending') return { ...v, raw: { ...v.raw, source: 'airpay-signed-return (sandbox)' } }
  }
  if (lastErr && !verdict) throw lastErr
  return verdict || { status: null }
}

/* -------------------------------------------------------------- callback */

/**
 * Which order an AirPay return / IPN is about.
 *
 * v3 posts plain fields; v4 posts `response`, encrypted with our key. A v4
 * payload that decrypts and whose AP_SECUREHASH matches is returned as
 * `signed` — evidence verifyAirpay() may use for a sandbox merchant only.
 * `invalid` marks a `response` that is not ours (forged or corrupted).
 */
export function orderFromCallback(body = {}, cfg = airpayConfig()) {
  let f = Object.fromEntries(Object.entries(body).map(([k, v]) => [k.toUpperCase(), v]))
  let signed = null
  let invalid = false
  if (f.RESPONSE) {
    try {
      const opened = JSON.parse(decryptV4(f.RESPONSE, v4Key(cfg)))
      f = fieldsFromV4(opened?.data && typeof opened.data === 'object' ? opened.data : opened)
      if (secureHashMatches(f, cfg) === true) signed = f
      else log.warn(`airpay callback for ${f.TRANSACTIONID}: decrypted, but AP_SECUREHASH did not match`)
    } catch {
      invalid = true
      f = {}
    }
  }
  return {
    orderId: f.TRANSACTIONID ? String(f.TRANSACTIONID).slice(0, 40) : null,
    providerRef: f.APTRANSACTIONID ? String(f.APTRANSACTIONID).slice(0, 40) : null,
    signed,
    invalid,
  }
}

/**
 * Does AP_SECUREHASH match crc32(TRANSACTIONID:APTRANSACTIONID:AMOUNT:
 * TRANSACTIONSTATUS:MESSAGE:MID:USERNAME)? Informational only — the result is
 * logged so the formula can be confirmed in AirPay's sandbox; the outcome still
 * comes from verify().
 */
export function secureHashMatches(body = {}, cfg = airpayConfig()) {
  const f = Object.fromEntries(Object.entries(body).map(([k, v]) => [k.toUpperCase(), v]))
  if (!f.AP_SECUREHASH) return null
  const s = [f.TRANSACTIONID, f.APTRANSACTIONID, f.AMOUNT, f.TRANSACTIONSTATUS, f.MESSAGE, cfg.merchantId, cfg.username].map((x) => x ?? '').join(':')
  return String(crc32(s)) === String(f.AP_SECUREHASH).trim()
}
