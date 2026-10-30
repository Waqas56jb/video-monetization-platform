import { Router } from 'express'
import { z } from 'zod'
import { one, many, query } from '../../db/pool.js'
import { asyncHandler, badRequest, conflict, forbidden, notFound } from '../../lib/errors.js'
import { validate } from '../../middleware/validate.js'
import { requireAuth } from '../../middleware/auth.js'
import { paymentProvider, verifyWebhook, OUTCOMES } from './provider.js'
import {
  settlePayment,
  reconcilePayment,
  publicPayment,
  newMerchantOrderId,
  PENDING_EXPIRES_MS,
} from './payments.service.js'
import { env } from '../../config/env.js'
import { log } from '../../lib/logger.js'
import { normalizeTrafficSource } from '../../lib/trafficSource.js'

const router = Router()

const initiateSchema = z.object({
  videoId: z.string().uuid('videoId must be a valid id'),
  method: z.enum(['mpesa', 'airtel'], { errorMap: () => ({ message: 'Choose M-Pesa or Airtel Money' }) }),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\s-]{9,15}$/, 'Enter a valid mobile money number'),
  // Sandbox only — lets the client demo every outcome on the staging URL.
  simulate: z.enum(OUTCOMES).optional(),
  // Where the viewer came from (WhatsApp, Facebook, a campaign link…).
  // Reporting only — normalised server-side, never decides access.
  source: z
    .object({
      source: z.string().max(40).nullish(),
      campaign: z.string().max(120).nullish(),
      referrer: z.string().max(300).nullish(),
    })
    .nullish(),
})

/* ------------------------------------------------------------- initiate */
router.post(
  '/initiate',
  requireAuth(),
  validate(initiateSchema),
  asyncHandler(async (req, res) => {
    const { videoId, method, phone, simulate } = req.body
    const traffic = normalizeTrafficSource(req.body.source)

    const video = await one(
      `select * from videos where id = $1 and deleted_at is null`,
      [videoId]
    )
    if (!video) throw notFound('Video not found')
    if (!(video.is_published && video.review_status === 'approved')) {
      throw badRequest('This video is not on sale')
    }
    if (video.access_type === 'free_with_ads') throw badRequest('This video is free to watch')
    if (video.creator_id === req.user.id) throw badRequest('You cannot buy your own video')

    const owned = await one(
      `select id from purchases where user_id = $1 and video_id = $2 and status = 'active'`,
      [req.user.id, videoId]
    )
    if (owned) throw conflict('You already own this video')

    // Reuse an in-flight attempt rather than charging twice. Same window as
    // the expiry, so there is never a second live prompt for one video.
    const inflight = await one(
      `select * from payments
        where user_id = $1 and video_id = $2 and status = 'pending'
          and created_at > now() - make_interval(secs => $3)
        order by created_at desc limit 1`,
      [req.user.id, videoId, PENDING_EXPIRES_MS / 1000]
    )
    if (inflight) {
      return res.status(200).json({
        payment: publicPayment(inflight),
        resumed: true,
        message: 'You already have a payment waiting — check your phone',
      })
    }

    const provider = paymentProvider()

    const payment = await one(
      `insert into payments (user_id, video_id, provider, amount_tzs, method, phone, merchant_order_id,
                             traffic_source, traffic_campaign, traffic_referrer)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning *`,
      [req.user.id, videoId, provider.name, video.price_tzs, method, phone, newMerchantOrderId(),
        traffic.source, traffic.campaign, traffic.referrer]
    )

    let result
    try {
      result = await provider.initiate({
        paymentId: payment.id,
        orderId: payment.merchant_order_id,
        amountTzs: video.price_tzs,
        method,
        phone,
        simulate,
        buyer: { id: req.user.id, email: req.user.email, fullName: req.user.full_name },
        // The sandbox's stand-in for a gateway callback: it only triggers a
        // verification, exactly like the real webhook below.
        onResolved: async () => reconcilePayment(await one('select * from payments where id = $1', [payment.id]), { via: 'sandbox-push' }),
      })
    } catch (err) {
      /* The gateway refused or was unreachable: no prompt reached the phone, so
         nothing can be charged. Close the attempt so a retry starts clean
         instead of being handed this dead one as "in flight". */
      await one(
        `update payments set status = 'failed', failure_reason = $2, updated_at = now()
          where id = $1 and status = 'pending' returning id`,
        [payment.id, 'The payment request could not be sent to the mobile money provider. Nothing was charged.']
      )
      throw err
    }

    /**
     * Keep what the provider told us, not just the reference.
     *
     * `verify()` needs it to settle a payment whose confirmation never arrived —
     * see the note on the sandbox provider about scheduled work not surviving a
     * serverless response.
     */
    await one(
      `update payments set raw_callback = coalesce(raw_callback, '{}'::jsonb) || $2::jsonb
        where id = $1 returning id`,
      [
        payment.id,
        JSON.stringify({
          initiated: {
            settlesAs: result.settlesAs ?? null,
            settlesAfterMs: result.settlesAfterMs ?? null,
          },
        }),
      ]
    )

    const updated = await one(
      `update payments set provider_ref = $2, updated_at = now() where id = $1 returning *`,
      [payment.id, result.providerRef]
    )

    res.status(201).json({
      payment: publicPayment(updated),
      instructions: result.instructions,
      // A hosted checkout (AirPay): the browser posts these fields to `url`.
      ...(result.redirect ? { redirect: result.redirect } : {}),
      ...(result.simulated ? { simulatedOutcome: result.simulated } : {}),
      pollUrl: `/api/payments/${updated.id}`,
    })
  })
)

/* ------------------------------------- poll one payment (client polls this) */
router.get(
  '/:id',
  requireAuth(),
  asyncHandler(async (req, res) => {
    let payment = await one('select * from payments where id = $1', [req.params.id])
    if (!payment) throw notFound('Payment not found')
    if (payment.user_id !== req.user.id && req.user.role !== 'admin') {
      throw forbidden('This is not your payment')
    }

    /**
     * Ask the provider before answering, if this is still hanging.
     *
     * A push notification is the fast path, not the only one. It can be lost —
     * a dropped webhook, a retry that never came, a serverless instance frozen
     * before its callback ran — and a payment stuck on "pending" for ever is
     * indistinguishable to the customer from having been charged for nothing.
     * So the poll the customer's browser is already making doubles as the
     * reconciliation: whatever the provider says now is what we record.
     */
    if (payment.status === 'pending') {
      await reconcilePayment(payment, { via: 'status-poll' }).catch((err) => log.warn(`poll reconcile: ${err.message}`))
      payment = (await one('select * from payments where id = $1', [payment.id])) || payment
    }

    const purchase =
      payment.status === 'success'
        ? await one(
            `select id, purchased_at from purchases
              where payment_id = $1 and status = 'active'`,
            [payment.id]
          )
        : null

    res.json({
      payment: publicPayment(payment),
      unlocked: Boolean(purchase),
      purchase,
      // The player calls this once unlocked to resume from where it stopped.
      playbackUrl: purchase ? `/api/playback/${payment.video_id}/playback` : null,
    })
  })
)

/* ------------------------------------------------------- my payment history */
router.get(
  '/',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const rows = await many(
      `select p.*, v.title as video_title
         from payments p join videos v on v.id = p.video_id
        where p.user_id = $1
        order by p.created_at desc limit 100`,
      [req.user.id]
    )
    res.json({
      payments: rows.map((r) => ({ ...publicPayment(r), videoTitle: r.video_title })),
    })
  })
)

/* --------------------------------------------------------------- webhook */
/**
 * The gateway calls this when a payment changes. It is a doorbell, not a
 * verdict: the body only says WHICH payment, and the outcome recorded is what
 * the gateway answers when we ask it ourselves (reconcilePayment). A forged or
 * replayed callback can therefore trigger a check, never an unlock.
 *
 * A signature is still enforced whenever a secret is configured.
 */
router.post(
  '/webhook/:provider',
  asyncHandler(async (req, res) => {
    const provider = paymentProvider()
    if (req.params.provider !== provider.name) throw notFound('Unknown payment provider')

    if (provider.authenticateCallback) {
      if (!provider.authenticateCallback({ ...(req.query || {}), ...(req.body || {}) })) throw forbidden('Invalid callback')
    } else if (env.payments.webhookSecret) {
      const signature = req.headers['x-signature'] || req.headers['x-mtonyo-signature']
      if (!verifyWebhook(signature, req.rawBody || JSON.stringify(req.body))) {
        log.warn('rejected payment webhook with a bad signature')
        throw forbidden('Invalid signature')
      }
    }

    const ref = provider.parseCallback({ ...(req.query || {}), ...(req.body || {}) })
    if (!ref.orderId && !ref.providerRef) throw badRequest('Callback does not name a payment')

    const payment = ref.orderId
      ? await one('select * from payments where merchant_order_id = $1', [ref.orderId])
      : await one('select * from payments where provider_ref = $1', [ref.providerRef])
    if (!payment) {
      log.warn(`payment callback for an unknown payment (${ref.orderId || ref.providerRef})`)
      throw notFound('Unknown payment')
    }

    const result = await reconcilePayment(payment, { via: 'callback', signed: ref.signed || null })
    const fresh = await one('select status from payments where id = $1', [payment.id])
    res.json({ ok: true, status: fresh?.status || payment.status, unlocked: Boolean(result.unlocked) })
  })
)

/* ---------------------------------------------------------- browser return */
/**
 * Where a hosted checkout sends the viewer back (AirPay "Return URL").
 *
 * Like the webhook, what the browser brings is not believed: it only names the
 * order. We ask the gateway once, then send the viewer to the video with
 * `?payment=<id>`, where the sheet reopens on that payment, keeps checking,
 * and resumes playback from the preview stop as soon as it is verified.
 * Always a redirect to OUR site — never to a URL taken from the request.
 */
router.all(
  '/return/:provider',
  asyncHandler(async (req, res) => {
    const provider = paymentProvider()
    const home = env.publicWebUrl.replace(/\/$/, '')
    if (req.params.provider !== provider.name) return res.redirect(303, home)

    const ref = provider.parseCallback({ ...(req.query || {}), ...(req.body || {}) })
    const payment = ref.orderId
      ? await one('select * from payments where merchant_order_id = $1', [ref.orderId])
      : ref.providerRef
        ? await one('select * from payments where provider_ref = $1', [ref.providerRef])
        : null
    if (!payment) {
      log.warn(`payment return for an unknown order (${ref.orderId || ref.providerRef || 'none'})`)
      return res.redirect(303, `${home}/library`)
    }

    await reconcilePayment(payment, { via: 'return', signed: ref.signed || null }).catch((err) => log.warn(`return reconcile: ${err.message}`))
    const video = await one('select slug, id from videos where id = $1', [payment.video_id])
    res.set('Cache-Control', 'no-store')
    res.redirect(303, `${home}/watch/${encodeURIComponent(video?.slug || payment.video_id)}?payment=${payment.id}`)
  })
)

/* ------------------------------------------------------------ sandbox aid */
/**
 * Force a pending sandbox payment to a given outcome. Lets the client
 * demonstrate success / failed / cancelled / expired on demand while testing,
 * without waiting for a timer. Disabled once a real provider is configured.
 */
router.post(
  '/:id/simulate',
  requireAuth(),
  validate(z.object({ outcome: z.enum(['success', 'failed', 'cancelled', 'expired']) })),
  asyncHandler(async (req, res) => {
    if (env.payments.provider !== 'sandbox') {
      throw forbidden('Simulation is only available with the sandbox provider')
    }
    const payment = await one('select * from payments where id = $1', [req.params.id])
    if (!payment) throw notFound('Payment not found')
    if (payment.user_id !== req.user.id && req.user.role !== 'admin') {
      throw forbidden('This is not your payment')
    }
    if (payment.status !== 'pending') throw conflict(`This payment is already ${payment.status}`)

    const reasons = {
      failed: 'Insufficient balance in the mobile money account',
      cancelled: 'The customer cancelled the payment on their phone',
      expired: 'The customer did not approve the request in time',
    }

    /* The sandbox's "gateway" answers verify() from the outcome recorded at the
       start; a forced outcome rewrites that answer, or a later poll would
       verify the original one — e.g. turn a forced "failed" into a success. */
    await one(
      `update payments
          set raw_callback = jsonb_set(coalesce(raw_callback, '{}'::jsonb), '{initiated,settlesAs}', to_jsonb($2::text), true)
        where id = $1 returning id`,
      [payment.id, req.body.outcome]
    )

    const result = await settlePayment({
      paymentId: payment.id,
      status: req.body.outcome,
      failureReason: reasons[req.body.outcome] || null,
      raw: { forced: true, by: req.user.id },
    })

    const fresh = await one('select * from payments where id = $1', [payment.id])
    res.json({ payment: publicPayment(fresh), unlocked: Boolean(result.unlocked) })
  })
)

export default router
