import crypto from 'node:crypto'
import { env } from '../../config/env.js'
import { log } from '../../lib/logger.js'
import { badRequest, serviceUnavailable } from '../../lib/errors.js'
import { airpayConfig, missingAirpayConfig, checkoutRequest, verifyAirpay, orderFromCallback, secureHashMatches } from './airpay.js'

/**
 * The payment provider contract.
 *
 * Milestone 2 runs `sandbox`; Milestone 3 drops in `airpay` behind the same
 * three methods. Nothing in the monetisation code — purchases, entitlements,
 * the revenue split — knows which provider is active, which is exactly the
 * "swap it in without rebuilding" the client asked for.
 *
 *   initiate({ paymentId, orderId, amountTzs, method, phone, ... })
 *                    -> { providerRef, status: 'pending', instructions }
 *   verify(ref, payment)
 *                    -> { status: 'success'|'failed'|'cancelled'|'expired'|'pending'|null,
 *                         failureReason?, providerTxnId?, raw? }
 *                       The gateway's OWN answer (order verification). The only
 *                       thing that can unlock a video — see reconcilePayment.
 *   parseCallback(b) -> { orderId?, providerRef? }
 *                       Which payment a callback is about. Its status is never
 *                       trusted: a callback only triggers verify().
 */

/* ------------------------------------------------------------------ sandbox */

/**
 * A test provider that behaves like a real mobile-money STK push: it returns
 * immediately as `pending`, then confirms out-of-band a few seconds later.
 *
 * Milestone 2 default: always succeed after ~3s so the unlock path is easy to
 * demo. Optional `simulate` in the request body still forces other outcomes:
 *   success | failed | cancelled | expired | pending
 *
 * Milestone 3 swaps this for AirPay behind the same interface.
 */
const OUTCOMES = ['success', 'failed', 'cancelled', 'expired', 'pending']

function decideOutcome({ simulate }) {
  if (simulate) {
    if (!OUTCOMES.includes(simulate)) throw badRequest(`simulate must be one of ${OUTCOMES.join(', ')}`)
    return simulate
  }
  return 'success'
}

const REASONS = {
  failed: 'Insufficient balance in the mobile money account',
  cancelled: 'The customer cancelled the payment on their phone',
  expired: 'The customer did not approve the request in time',
}

const sandbox = {
  name: 'sandbox',

  async initiate({ paymentId, orderId, amountTzs, method, phone, simulate, onResolved }) {
    const providerRef = `SBX-${crypto.randomBytes(5).toString('hex').toUpperCase()}`
    const outcome = decideOutcome({ simulate })

    log.info(`sandbox payment ${orderId || paymentId} / ${providerRef} → ${outcome} (${method}, TZS ${amountTzs})`)

    if (outcome !== 'pending') {
      // Mimic the gateway's callback a few seconds later. Like a real one, it
      // carries no authority: the route answers it by calling verify().
      setTimeout(() => {
        Promise.resolve(onResolved?.({ orderId, providerRef })).catch((err) => log.error('sandbox callback failed:', err.message))
      }, env.payments.sandboxDelayMs + 50).unref?.()
    }

    return {
      providerRef,
      /**
       * What this payment will settle as, and when.
       *
       * The timer above is not a promise this environment can keep. On a
       * serverless platform the function may be frozen the moment its response
       * is sent, so anything scheduled after that may simply never run — and a
       * payment left pending for ever reads to the customer as a platform that
       * takes your money and gives you nothing. Recording the intended outcome
       * lets `verify()` settle it on the next poll instead of depending on a
       * callback that may already have been killed.
       */
      settlesAs: outcome,
      settlesAfterMs: env.payments.sandboxDelayMs,
      status: 'pending',
      instructions:
        outcome === 'pending'
          ? 'Test payment left pending on purpose — it will not confirm.'
          : `Check your phone and enter your ${method === 'mpesa' ? 'M-Pesa' : 'Airtel Money'} PIN to approve.`,
      simulated: outcome,
    }
  },

  /**
   * Settle a payment that the push never got round to.
   *
   * A real provider is asked "what happened to this reference?" and answers from
   * its own records. The sandbox has no upstream, so it answers from what it
   * decided at the outset: the outcome and the delay were written onto the
   * payment when it was created, so once that delay has passed the answer is
   * knowable without the timer having survived.
   */
  async verify(_ref, payment) {
    const meta = payment?.raw_callback?.initiated || null
    const settlesAs = meta?.settlesAs
    const after = Number(meta?.settlesAfterMs ?? env.payments.sandboxDelayMs)

    if (!settlesAs || settlesAs === 'pending') return { status: null }

    const startedAt = payment?.created_at ? new Date(payment.created_at).getTime() : null
    if (startedAt && Date.now() - startedAt < after) return { status: null } // not yet

    return {
      status: settlesAs === 'success' ? 'success' : settlesAs,
      failureReason: REASONS[settlesAs] || null,
    }
  },

  parseCallback(body) {
    return { orderId: body.orderId || null, providerRef: body.providerRef || body.reference || null }
  },
}

/* ------------------------------------------------------------------- airpay */

/**
 * AirPay Tanzania: hosted checkout, then server-side order verification.
 * The formulas and field rules live in ./airpay.js.
 */
const airpay = {
  name: 'airpay',
  async initiate({ orderId, amountTzs, method, phone, buyer }) {
    const cfg = airpayConfig()
    const missing = missingAirpayConfig(cfg)
    if (missing.length) {
      log.error(`AirPay is selected but not configured (missing ${missing.join(', ')})`)
      throw serviceUnavailable('Mobile money payments are temporarily unavailable. Nothing was charged — please try again shortly.')
    }
    let redirect
    try {
      redirect = await checkoutRequest({ cfg, orderId, amountTzs, method, phone, userId: buyer?.id, email: buyer?.email, fullName: buyer?.fullName })
    } catch (err) {
      // v4 needs a token first; if AirPay refuses it, nobody has been charged.
      log.error(`airpay checkout ${orderId}: ${err.message}`)
      throw serviceUnavailable('Mobile money payments are temporarily unavailable. Nothing was charged — please try again shortly.')
    }
    log.info(`airpay ${cfg.version} checkout ${orderId} (${method}, TZS ${amountTzs})`)
    return {
      providerRef: null, // AirPay's transaction id arrives with verification
      status: 'pending',
      redirect,
      instructions: `Continue on AirPay's secure page to pay with ${method === 'airtel' ? 'Airtel Money' : 'M-Pesa'}.`,
    }
  },
  async verify(_ref, payment, { signed } = {}) {
    return verifyAirpay(payment, { signed })
  },
  parseCallback(body) {
    return orderFromCallback(body)
  },
  /* AirPay does not sign with our webhook secret. A plain (v3) callback is
     only a doorbell — the outcome comes from verify() — so it is accepted, and
     whether its AP_SECUREHASH matched is logged. A v4 `response` that does not
     decrypt with our key is not from AirPay and is refused. */
  authenticateCallback(body) {
    if (body?.response || body?.RESPONSE) return !orderFromCallback(body).invalid
    const ok = secureHashMatches(body)
    if (ok === false) log.warn('airpay callback: AP_SECUREHASH did not match (outcome is verified independently)')
    return true
  },
}

const PROVIDERS = { sandbox, airpay }

export function paymentProvider() {
  const p = PROVIDERS[env.payments.provider]
  if (!p) throw serviceUnavailable(`Unknown PAYMENT_PROVIDER "${env.payments.provider}"`)
  return p
}

/** Sign a webhook body so callbacks can be trusted. */
export function signWebhook(payload) {
  return crypto
    .createHmac('sha256', env.payments.webhookSecret || 'unset')
    .update(typeof payload === 'string' ? payload : JSON.stringify(payload))
    .digest('hex')
}

export function verifyWebhook(signature, payload) {
  if (!env.payments.webhookSecret) return true
  const expected = signWebhook(payload)
  try {
    return crypto.timingSafeEqual(Buffer.from(String(signature || ''), 'utf8'), Buffer.from(expected, 'utf8'))
  } catch {
    return false
  }
}

export { OUTCOMES }
