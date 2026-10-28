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

/** AirPay's checksum date, YYYY-MM-DD, in the merchant's timezone. */
export function airpayDate(now = new Date(), timeZone = 'Africa/Dar_es_Salaam') {
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
  return {
    merchantId: a.merchantId,
    username: a.username,
    password: a.password,
    secret: a.secret,
    payUrl: a.payUrl || 'https://payments.airpay.tz/pay/index.php',
    verifyUrl: a.verifyUrl || 'https://payments.airpay.tz/order/verify.php',
    currency: a.currency || '834',
    isoCurrency: a.isoCurrency || 'TZS',
    chmod: a.chmod ?? '',
    timeZone: a.timeZone || 'Africa/Dar_es_Salaam',
    timeoutMs: Number(a.timeoutMs || 15000),
  }
}

export function missingAirpayConfig(cfg = airpayConfig()) {
  return ['merchantId', 'username', 'password', 'secret'].filter((k) => !cfg[k])
}

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

  if (mapped.status === 'success') {
    /* A success must be for THIS order and THIS amount — a verified success
       for the wrong amount is not a sale of this video. Leave it unresolved
       (no unlock) and shout, so an admin sorts it out with AirPay. */
    const orderOk = !raw.orderid || raw.orderid === payment.merchant_order_id
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

/* -------------------------------------------------------------- callback */

/** Which order an AirPay return / IPN is about. Its status is never used. */
export function orderFromCallback(body = {}) {
  const f = Object.fromEntries(Object.entries(body).map(([k, v]) => [k.toUpperCase(), v]))
  return {
    orderId: f.TRANSACTIONID ? String(f.TRANSACTIONID).slice(0, 40) : null,
    providerRef: f.APTRANSACTIONID ? String(f.APTRANSACTIONID).slice(0, 40) : null,
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
