import { one, transaction } from '../../db/pool.js'
import { splitPercentFor, applySplit } from '../../services/settings.js'
import { log } from '../../lib/logger.js'

/**
 * Settle a payment result.
 *
 * On success this is ONE transaction that: marks the payment paid, creates the
 * permanent entitlement, writes the revenue split to the ledger and bumps the
 * video's counter. Either the customer gets access AND the creator gets
 * credited, or nothing happens at all — money and access can never disagree.
 *
 * Idempotent: providers retry webhooks, so a second call for an already-settled
 * payment is a no-op.
 */
export async function settlePayment({ providerRef, status, failureReason, raw }) {
  const payment = await one(
    `select * from payments where provider_ref = $1`,
    [providerRef]
  )
  if (!payment) {
    log.warn(`callback for unknown payment ref ${providerRef}`)
    return { handled: false, reason: 'unknown-reference' }
  }
  if (payment.status !== 'pending') {
    return { handled: true, idempotent: true, payment }
  }

  if (status !== 'success') {
    const updated = await one(
      `update payments
          set status = $2, failure_reason = $3, raw_callback = $4, updated_at = now()
        where id = $1 returning *`,
      [payment.id, status, failureReason || null, raw ? JSON.stringify(raw) : null]
    )
    // Nothing else changes: the video stays locked, no earnings are recorded.
    return { handled: true, payment: updated, unlocked: false }
  }

  const video = await one('select * from videos where id = $1', [payment.video_id])
  const percent = await splitPercentFor(video.creator_id)
  const split = applySplit(payment.amount_tzs, percent)

  const result = await transaction(async (client) => {
    const { rows: pay } = await client.query(
      `update payments
          set status = 'success', raw_callback = $2, completed_at = now(), updated_at = now()
        where id = $1 and status = 'pending'
        returning *`,
      [payment.id, raw ? JSON.stringify(raw) : null]
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
      [
        payment.user_id,
        payment.video_id,
        payment.id,
        payment.amount_tzs,
        split.percent,
        split.creator,
        split.platform,
      ]
    )

    const purchase = purchaseRows[0] ?? null

    if (purchase) {
      await client.query(
        `insert into earnings
           (creator_id, video_id, purchase_id, source, gross_tzs, creator_tzs, platform_tzs, split_percent)
         values ($1,$2,$3,'sale',$4,$5,$6,$7)`,
        [video.creator_id, video.id, purchase.id, payment.amount_tzs, split.creator, split.platform, split.percent]
      )
      // `videos.paid_unlocks` is recounted from `purchases` by a trigger
      // (migration 006), so it needs no help from here.
    }

    return { payment: pay[0], purchase }
  })

  if (result.idempotent) return { handled: true, idempotent: true, payment }

  log.ok(
    `payment ${providerRef} settled — TZS ${payment.amount_tzs} ` +
      `(creator ${split.creator} / platform ${split.platform} @ ${split.percent}%)`
  )

  return { handled: true, payment: result.payment, purchase: result.purchase, unlocked: true, split }
}

/** Shape a payment row for the API. */
export const publicPayment = (p) => ({
  id: p.id,
  videoId: p.video_id,
  amountTzs: p.amount_tzs,
  method: p.method,
  phone: p.phone,
  status: p.status,
  failureReason: p.failure_reason,
  providerRef: p.provider_ref,
  createdAt: p.created_at,
  completedAt: p.completed_at,
})
