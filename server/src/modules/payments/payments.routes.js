import { Router } from 'express'
import { z } from 'zod'
import { one, many, query } from '../../db/pool.js'
import { asyncHandler, badRequest, conflict, forbidden, notFound } from '../../lib/errors.js'
import { validate } from '../../middleware/validate.js'
import { requireAuth } from '../../middleware/auth.js'
import { paymentProvider, verifyWebhook, OUTCOMES } from './provider.js'
import { settlePayment, publicPayment } from './payments.service.js'
import { env } from '../../config/env.js'
import { log } from '../../lib/logger.js'

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
})

/* ------------------------------------------------------------- initiate */
router.post(
  '/initiate',
  requireAuth(),
  validate(initiateSchema),
  asyncHandler(async (req, res) => {
    const { videoId, method, phone, simulate } = req.body

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

    // Reuse an in-flight attempt rather than charging twice.
    const inflight = await one(
      `select * from payments
        where user_id = $1 and video_id = $2 and status = 'pending'
          and created_at > now() - interval '10 minutes'
        order by created_at desc limit 1`,
      [req.user.id, videoId]
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
      `insert into payments (user_id, video_id, provider, amount_tzs, method, phone)
       values ($1,$2,$3,$4,$5,$6) returning *`,
      [req.user.id, videoId, provider.name, video.price_tzs, method, phone]
    )

    const result = await provider.initiate({
      paymentId: payment.id,
      amountTzs: video.price_tzs,
      method,
      phone,
      simulate,
      // The provider calls this when the customer approves/declines.
      onResolved: (payload) => settlePayment(payload),
    })

    const updated = await one(
      `update payments set provider_ref = $2, updated_at = now() where id = $1 returning *`,
      [payment.id, result.providerRef]
    )

    res.status(201).json({
      payment: publicPayment(updated),
      instructions: result.instructions,
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
    const payment = await one('select * from payments where id = $1', [req.params.id])
    if (!payment) throw notFound('Payment not found')
    if (payment.user_id !== req.user.id && req.user.role !== 'admin') {
      throw forbidden('This is not your payment')
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
 * Providers call this to report the final outcome. Signature-checked, and
 * idempotent so retries are harmless.
 */
router.post(
  '/webhook/:provider',
  asyncHandler(async (req, res) => {
    const signature = req.headers['x-signature'] || req.headers['x-mtonyo-signature']
    if (!verifyWebhook(signature, req.rawBody || JSON.stringify(req.body))) {
      log.warn('rejected payment webhook with a bad signature')
      throw forbidden('Invalid signature')
    }

    const provider = paymentProvider()
    const parsed = provider.parseCallback(req.body || {})
    if (!parsed.providerRef || !parsed.status) throw badRequest('Callback is missing a reference or status')

    const result = await settlePayment(parsed)
    res.json({ ok: true, handled: result.handled, unlocked: Boolean(result.unlocked) })
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

    const result = await settlePayment({
      providerRef: payment.provider_ref,
      status: req.body.outcome,
      failureReason: reasons[req.body.outcome] || null,
      raw: { forced: true, by: req.user.id },
    })

    const fresh = await one('select * from payments where id = $1', [payment.id])
    res.json({ payment: publicPayment(fresh), unlocked: Boolean(result.unlocked) })
  })
)

export default router
