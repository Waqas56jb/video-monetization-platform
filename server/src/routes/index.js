import { Router } from 'express'
import authRoutes from '../modules/auth.routes.js'
import videoRoutes from '../modules/videos.routes.js'
import playbackRoutes from '../modules/playback.routes.js'
import paymentRoutes from '../modules/payments/payments.routes.js'
import libraryRoutes from '../modules/library.routes.js'
import earningsRoutes from '../modules/earnings.routes.js'
import shareRoutes from '../modules/share.routes.js'
import adsRoutes from '../modules/ads.routes.js'
import adminRoutes from '../modules/admin.routes.js'
import { runPremiereExpiry } from '../jobs/premiere.js'
import { asyncHandler, forbidden } from '../lib/errors.js'
import { env } from '../config/env.js'

const router = Router()

router.use('/auth', authRoutes)
router.use('/videos', videoRoutes)
router.use('/playback', playbackRoutes)
router.use('/payments', paymentRoutes)
router.use('/library', libraryRoutes)
router.use('/earnings', earningsRoutes)
router.use('/share', shareRoutes)
router.use('/ads', adsRoutes)
router.use('/admin', adminRoutes)

/**
 * Cron entry point for a scheduler (Vercel Cron, GitHub Actions, cron-job.org).
 * Guarded by a shared secret so it cannot be triggered by anyone.
 */
router.post(
  '/jobs/premiere-expiry',
  asyncHandler(async (req, res) => {
    const provided = req.headers['x-cron-secret'] || req.query.secret
    if (!env.cronSecret || provided !== env.cronSecret) throw forbidden('Invalid cron secret')
    res.json(await runPremiereExpiry())
  })
)

export default router
