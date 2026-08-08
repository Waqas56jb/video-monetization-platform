import crypto from 'node:crypto'
import { env } from '../../config/env.js'
import { log } from '../../lib/logger.js'
import { badRequest, serviceUnavailable } from '../../lib/errors.js'

/**
 * The payment provider contract.
 *
 * Milestone 2 runs `sandbox`; Milestone 3 drops in `airpay` behind the same
 * three methods. Nothing in the monetisation code — purchases, entitlements,
 * the revenue split — knows which provider is active, which is exactly the
 * "swap it in without rebuilding" the client asked for.
 *
 *   initiate({...})  -> { providerRef, status, instructions }
 *   verify(ref)      -> { status, failureReason? }
 *   parseCallback(b) -> { providerRef, status, failureReason?, raw }
 */

/* ------------------------------------------------------------------ sandbox */

/**
 * A test provider that behaves like a real mobile-money STK push: it returns
 * immediately as `pending`, then confirms out-of-band a few seconds later.
 *
 * The outcome is chosen deterministically so all four required cases can be
 * demonstrated on the staging URL:
 *   - `simulate` in the request body wins, when supplied
 *   - otherwise the phone number's last digit decides:
 *       ...0  -> failed      ...1 -> cancelled     ...2 -> expired
 *       ...3  -> stays pending (never confirms)    anything else -> success
 */
const OUTCOMES = ['success', 'failed', 'cancelled', 'expired', 'pending']

function decideOutcome({ phone, simulate }) {
  if (simulate) {
    if (!OUTCOMES.includes(simulate)) throw badRequest(`simulate must be one of ${OUTCOMES.join(', ')}`)
    return simulate
  }
  const last = String(phone).replace(/\D/g, '').slice(-1)
  return { 0: 'failed', 1: 'cancelled', 2: 'expired', 3: 'pending' }[last] || 'success'
}

const REASONS = {
  failed: 'Insufficient balance in the mobile money account',
  cancelled: 'The customer cancelled the payment on their phone',
  expired: 'The customer did not approve the request in time',
}

const sandbox = {
  name: 'sandbox',

  async initiate({ paymentId, amountTzs, method, phone, simulate, onResolved }) {
    const providerRef = `SBX-${crypto.randomBytes(5).toString('hex').toUpperCase()}`
    const outcome = decideOutcome({ phone, simulate })

    log.info(`sandbox payment ${providerRef} → ${outcome} (${method}, TZS ${amountTzs})`)

    if (outcome !== 'pending') {
      // Mimic the customer entering their PIN a few seconds later.
      setTimeout(() => {
        onResolved({
          providerRef,
          status: outcome === 'success' ? 'success' : outcome,
          failureReason: REASONS[outcome] || null,
          raw: { simulated: true, outcome, paymentId },
        }).catch((err) => log.error('sandbox callback failed:', err.message))
      }, env.payments.sandboxDelayMs).unref?.()
    }

    return {
      providerRef,
      status: 'pending',
      instructions:
        outcome === 'pending'
          ? 'Test payment left pending on purpose — it will not confirm.'
          : `Check your phone and enter your ${method === 'mpesa' ? 'M-Pesa' : 'Airtel Money'} PIN to approve.`,
      simulated: outcome,
    }
  },

  async verify() {
    // The sandbox pushes its result; there is nothing to poll upstream.
    return { status: null }
  },

  parseCallback(body) {
    return {
      providerRef: body.providerRef || body.reference,
      status: body.status,
      failureReason: body.failureReason || null,
      raw: body,
    }
  },
}

/* ------------------------------------------------------------------- airpay */

/**
 * Milestone 3. Kept as an explicit stub so the shape of the integration is
 * already agreed and the switch is a config change, not a rewrite.
 */
const airpay = {
  name: 'airpay',
  async initiate() {
    throw serviceUnavailable(
      'AirPay is not connected yet. Set PAYMENT_PROVIDER=sandbox for Milestone 2, ' +
        'or provide AIRPAY_* credentials to enable it.'
    )
  },
  async verify() {
    throw serviceUnavailable('AirPay is not connected yet')
  },
  parseCallback(body) {
    return {
      providerRef: body.transaction_id || body.reference,
      status: { SUCCESS: 'success', FAILED: 'failed', CANCELLED: 'cancelled', EXPIRED: 'expired' }[
        String(body.status || '').toUpperCase()
      ],
      failureReason: body.message || null,
      raw: body,
    }
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
