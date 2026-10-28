import crypto from 'node:crypto'
import { one, transaction } from '../../db/pool.js'
import { splitPercentFor, applySplit } from '../../services/settings.js'
import { log } from '../../lib/logger.js'
import { paymentProvider } from './provider.js'

/**
 * How long a payment may stay pending before we stop waiting for it.
 *
 * Mobile money prompts time out on the phone well inside this. Expiring is not
 * final: a gateway that later VERIFIES a success still settles it (see
 * `settlePayment`), because by then the money has moved.
 */
export const PENDING_EXPIRES_MS = 15 * 60 * 1000

const EXPIRED_REASON = 'No confirmation from the mobile money provider in time. If you were charged, access is granted as soon as the payment is confirmed.'

/**
 * Our order id: `MTN` + Dar es Salaam date + 8 random hex, e.g. MTN20261028A1B2C3D4.
 * 19 characters, alphanumeric only — the shape gateways accept for an order id.
 */
export function newMerchantOrderId(now = new Date()) {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Dar_es_Salaam', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(now)
    .replace(/-/g, '')
  return `MTN${day}${crypto.randomBytes(4).toString('hex').toUpperCase()}`
}

/** Which statuses a payment may move to from where it is. */
export function canMove(from, to) {
  if (from === to) return false
  if (from === 'pending') return true
  /* A VERIFIED success after we gave up waiting: the money moved, so the
     viewer gets what they paid for. Nothing else re-opens a closed payment. */
  if (to === 'success') return ['expired', 'failed', 'cancelled'].includes(from)
  return false
}

async function findPayment({ paymentId, providerRef, orderId }) {
  if (paymentId) return one('select * from payments where id = $1', [paymentId])
  if (orderId) return one('select * from payments where merchant_order_id = $1', [orderId])
  if (providerRef) return one('select * from payments where provider_ref = $1', [providerRef])
  return null
}

/**
 * Record an outcome for a payment.
 *
 * ONLY call this with an outcome the gateway itself has verified
 * (`reconcilePayment`), or from the sandbox's own test controls. A callback's
 * body, a redirect or a client claim is never enough — see `reconcilePayment`.
 *
 * On success this is ONE transaction that: marks the payment paid, creates the
 * permanent entitlement, writes the revenue split to the ledger. Either the
 * customer gets access AND the creator gets credited, or nothing happens.
 *
 * Idempotent: a second call for an already-settled payment is a no-op.
 */
export async function settlePayment({ paymentId, providerRef, orderId, status, failureReason, raw, providerTxnId }) {
  const payment = await findPayment({ paymentId, providerRef, orderId })
  if (!payment) {
    log.warn(`payment outcome for an unknown payment (ref ${providerRef || orderId || paymentId})`)
    return { handled: false, reason: 'unknown-reference' }
  }
  if (!canMove(payment.status, status)) {
    return { handled: true, idempotent: true, payment }
  }
  const rawJson = raw ? JSON.stringify(raw) : null

  if (status !== 'success') {
    const updated = await one(
      `update payments
          set status = $2, failure_reason = $3,
              raw_callback = coalesce(raw_callback, '{}'::jsonb) || coalesce($4::jsonb, '{}'::jsonb),
              updated_at = now()
        where id = $1 and status = 'pending' returning *`,
      [payment.id, status, failureReason || null, rawJson]
    )
    // Nothing else changes: the video stays locked, no earnings are recorded.
    return { handled: true, payment: updated || payment, unlocked: false }
  }

  const video = await one('select * from videos where id = $1', [payment.video_id])
  const percent = await splitPercentFor(video.creator_id)
  const split = applySplit(payment.amount_tzs, percent)

  const result = await transaction(async (client) => {
    const { rows: pay } = await client.query(
      `update payments
          set status = 'success', failure_reason = null, completed_at = now(), updated_at = now(),
              provider_ref = coalesce(provider_ref, $3),
              raw_callback = coalesce(raw_callback, '{}'::jsonb) || coalesce($2::jsonb, '{}'::jsonb)
        where id = $1 and status = $4
        returning *`,
      [payment.id, rawJson, providerTxnId || null, payment.status]
    )
    // Another worker beat us to it.
    if (!pay.length) return { idempotent: true }

    const { rows: purchaseRows } = await client.query(
      `insert into purchases
         (user_id, video_id, payment_id, amount_tzs, split_percent,
          creator_amount_tzs, platform_amount_tzs)
       values ($1,$2,$3,$4,$5,$6,$7)
       on conflict (user_id, video_id) where status = 'active' do nothing
       returning *`,
      [payment.user_id, payment.video_id, payment.id, payment.amount_tzs, split.percent, split.creator, split.platform]
    )
    const purchase = purchaseRows[0] ?? null

    if (!purchase) {
      /* Charged, but they already own it — two prompts both approved, or a
         late success for something bought since. The money is real: flag it
         for a refund instead of letting it disappear into a success row. */
      const { rows: flagged } = await client.query(
        `update payments
            set refund_due = true,
                failure_reason = 'Paid twice — the viewer already owns this video. Refund due.'
          where id = $1 returning *`,
        [payment.id]
      )
      return { payment: flagged[0], purchase: null, duplicate: true }
    }

    await client.query(
      `insert into earnings
         (creator_id, video_id, purchase_id, source, gross_tzs, creator_tzs, platform_tzs, split_percent)
       values ($1,$2,$3,'sale',$4,$5,$6,$7)`,
      [video.creator_id, video.id, purchase.id, payment.amount_tzs, split.creator, split.platform, split.percent]
    )
    // `videos.paid_unlocks` is recounted from `purchases` by a trigger (migration 006).
    return { payment: pay[0], purchase }
  })

  if (result.idempotent) return { handled: true, idempotent: true, payment }

  if (result.duplicate) {
    log.error(`payment ${payment.merchant_order_id || payment.id} succeeded but the viewer already owns the video — refund due (TZS ${payment.amount_tzs})`)
    return { handled: true, payment: result.payment, unlocked: true, duplicate: true }
  }

  log.ok(
    `payment ${payment.merchant_order_id || payment.id} settled — TZS ${payment.amount_tzs} ` +
      `(creator ${split.creator} / platform ${split.platform} @ ${split.percent}%)` +
      (payment.status !== 'pending' ? ` — late success after ${payment.status}` : '')
  )

  return { handled: true, payment: result.payment, purchase: result.purchase, unlocked: true, split }
}

/**
 * Ask the gateway what happened to a payment, and record ONLY its answer.
 *
 * This is the single road to an outcome. A callback, the viewer's polling and
 * the background sweep all come here, so content is unlocked exclusively on the
 * gateway's own verification — never on a callback body (which anyone can POST),
 * a "pending" / "initiated" response, or the viewer's browser.
 *
 * A payment still pending past PENDING_EXPIRES_MS with no verdict is marked
 * expired, so nobody waits forever; a later verified success still settles it.
 */
export async function reconcilePayment(payment, { via = 'unknown', now = Date.now() } = {}) {
  if (!payment) return { handled: false }
  const reopenable = payment.status === 'pending' || canMove(payment.status, 'success')
  if (!reopenable) return { handled: true, idempotent: true, payment }

  let verdict = null
  try {
    verdict = await paymentProvider().verify(payment.provider_ref, payment)
  } catch (err) {
    log.warn(`payment verify failed for ${payment.merchant_order_id || payment.id} (${via}): ${err.message}`)
  }

  const status = verdict?.status
  if (status && status !== 'pending') {
    return settlePayment({
      paymentId: payment.id,
      status,
      failureReason: verdict.failureReason || null,
      providerTxnId: verdict.providerTxnId || null,
      raw: { verified: { via, at: new Date(now).toISOString(), ...(verdict.raw ? { response: verdict.raw } : {}) } },
    })
  }

  const age = now - new Date(payment.created_at).getTime()
  if (payment.status === 'pending' && age > PENDING_EXPIRES_MS) {
    return settlePayment({
      paymentId: payment.id,
      status: 'expired',
      failureReason: EXPIRED_REASON,
      raw: { expired: { via, at: new Date(now).toISOString() } },
    })
  }
  return { handled: true, pending: payment.status === 'pending', payment }
}

/** Shape a payment row for the API. */
export const publicPayment = (p) => ({
  id: p.id,
  orderId: p.merchant_order_id || null,
  videoId: p.video_id,
  amountTzs: p.amount_tzs,
  method: p.method,
  phone: p.phone,
  status: p.status,
  failureReason: p.failure_reason,
  providerRef: p.provider_ref,
  refundDue: Boolean(p.refund_due),
  createdAt: p.created_at,
  completedAt: p.completed_at,
})
