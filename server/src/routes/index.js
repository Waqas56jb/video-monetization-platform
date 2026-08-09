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
import statsRoutes from '../modules/stats.routes.js'
import staffRoutes from '../modules/staff.routes.js'
import inboxRoutes from '../modules/inbox.routes.js'
import { runPremiereExpiry } from '../jobs/premiere.js'
import { asyncHandler, forbidden } from '../lib/errors.js'
import { env } from '../config/env.js'

const router = Router()

// Public platform figures for the landing page.
router.use('/stats', statsRoutes)

router.use('/auth', authRoutes)
router.use('/videos', videoRoutes)
router.use('/playback', playbackRoutes)
router.use('/payments', paymentRoutes)
router.use('/library', libraryRoutes)
router.use('/earnings', earningsRoutes)
router.use('/share', shareRoutes)
router.use('/ads', adsRoutes)
// Staff work — notifications, announcements, the sub-admin team. Mounted
// before /admin so the two never shadow each other.
router.use('/staff', staffRoutes)
router.use('/admin', adminRoutes)

// Every signed-in person has an inbox; announcements land there too.
router.use('/inbox', inboxRoutes)

/**
 * Cron entry point for a scheduler (Vercel Cron, GitHub Actions, cron-job.org).
 *
 * This is what moves a paid premiere to free-with-ads when its window closes.
 * Nothing else does it, so if this never runs, videos stay paid forever and
 * the client's central promise quietly stops working — which is exactly the
 * kind of failure nobody notices for a month.
 *
 * Guarded by a shared secret. Vercel Cron sends `Authorization: Bearer
 * $CRON_SECRET` and issues a GET; other schedulers usually POST with a custom
 * header. Both are accepted so the same URL works wherever it is scheduled.
 */
const cronHandler = asyncHandler(async (req, res) => {
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  const provided = req.headers['x-cron-secret'] || bearer || req.query.secret

  if (!env.cronSecret) {
    throw forbidden('CRON_SECRET is not set on the server, so scheduled jobs are disabled')
  }
  if (provided !== env.cronSecret) throw forbidden('Invalid cron secret')

  res.json(await runPremiereExpiry())
})

router.post('/jobs/premiere-expiry', cronHandler)
router.get('/jobs/premiere-expiry', cronHandler)

export default router
