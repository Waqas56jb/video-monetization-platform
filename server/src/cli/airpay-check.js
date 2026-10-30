#!/usr/bin/env node
/**
 * Can this server talk to AirPay with the configured credentials? Read-only.
 *
 *   npm run airpay:check
 *
 * Uses the AIRPAY_* environment exactly as the API does, and asks AirPay:
 *   1. v4 only: an OAuth access token (proves client id/secret + key)
 *   2. the order-confirmation API about an order that does not exist
 *      (a "no record" answer proves the merchant, username, password and
 *      secret; "Wrong checksum" means one of them is wrong)
 * Creates no order and charges nothing. Prints no credential or hash.
 */
import 'dotenv/config'
import { airpayConfig, missingAirpayConfig, accessToken, verifyOrder, verifyOrderV4 } from '../modules/payments/airpay.js'

const cfg = airpayConfig()
const line = (ok, msg) => console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${msg}`)
let failed = 0
const check = (ok, msg) => { line(ok, msg); if (!ok) failed++ }

console.log(`\n  AirPay ${cfg.version}${cfg.sandbox ? ' (sandbox merchant)' : ''} — merchant ${cfg.merchantId || '(unset)'}\n`)
const missing = missingAirpayConfig(cfg)
check(!missing.length, missing.length ? `missing ${missing.join(', ')}` : 'every required setting is present')
if (missing.length) process.exit(1)

const probe = { id: 'airpay-check', merchant_order_id: `MTNCHECK${Date.now().toString(36).toUpperCase()}`, amount_tzs: 1, provider_ref: null }

if (cfg.version === 'v4') {
  let token = false
  try {
    token = Boolean(await accessToken({ cfg }))
    check(true, 'AirPay issued an access token (client id, client secret, username and password accepted)')
  } catch (err) {
    check(false, `access token refused — ${err.message}`)
    console.log('        AirPay must enable this merchant for v4 and, if it filters by address, allow this server\'s outbound IP.')
  }
  if (token) try {
    const v = await verifyOrderV4(probe, { cfg })
    check(true, `v4 order confirmation answered (${v.raw?.message || v.raw?.code || 'no record'})`)
  } catch (err) {
    line(!cfg.sandbox ? false : true, `v4 order confirmation: ${err.message}${cfg.sandbox ? ' — expected for a sandbox merchant' : ''}`)
    if (!cfg.sandbox) failed++
  }
}

try {
  const v = await verifyOrder(probe, { cfg })
  const msg = v.raw?.message || ''
  check(!/checksum|invalid|merchant/i.test(msg), `order confirmation (v3) answered "${msg || v.raw?.code}"`)
} catch (err) {
  check(false, `order confirmation (v3) failed — ${err.message}`)
}

console.log(failed ? `\n  ${failed} FAIL\n` : '\n  ALL PASS — AirPay accepts this configuration\n')
process.exit(failed ? 1 : 0)
