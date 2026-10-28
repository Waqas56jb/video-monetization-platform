import { many } from '../db/pool.js'
import { reconcilePayment } from '../modules/payments/payments.service.js'

/**
 * Settle the payments nobody is watching any more.
 *
 * A viewer's open sheet reconciles its own payment on every poll, and the
 * gateway's callback triggers the same check. Both can be lost — the sheet is
 * closed, the phone locks, a callback never arrives — and a payment left
 * "pending" is money in limbo: possibly taken, certainly not delivered.
 *
 * Every few minutes this asks the gateway about:
 *   - every payment still pending (verified result recorded, or expired once
 *     it is past the 15-minute window), and
 *   - payments that EXPIRED in the last day, because a viewer can approve a
 *     prompt late and the gateway can confirm it after we stopped waiting.
 *     A verified success there unlocks the video; nothing else re-opens it.
 *
 * Idempotent: reconcilePayment only ever records the gateway's own answer, and
 * a settled payment is a no-op.
 */
export async function runPaymentSweep({ limit = 50 } = {}) {
  const rows = await many(
    `select * from payments
      where status = 'pending'
         or (status = 'expired' and created_at > now() - interval '24 hours')
      order by created_at asc
      limit $1`,
    [limit]
  )
  let settled = 0
  for (const p of rows) {
    const r = await reconcilePayment(p, { via: 'sweep' }).catch(() => null)
    if (r && !r.idempotent && !r.pending && r.payment && r.payment.status !== p.status) settled++
  }
  return { checked: rows.length, settled }
}
