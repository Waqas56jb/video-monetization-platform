import { Router } from 'express'
import authRoutes from '../modules/auth.routes.js'
import videoRoutes from '../modules/videos.routes.js'
import playbackRoutes from '../modules/playback.routes.js'
import shareCardRoutes from '../modules/shareCard.routes.js'
import publicRoutes from '../modules/public.routes.js'
import adsRoutes from '../modules/ads.routes.js'
import statsRoutes from '../modules/stats.routes.js'
import { runPremiereExpiry } from '../jobs/premiere.js'
import { asyncHandler, forbidden } from '../lib/errors.js'
import { env } from '../config/env.js'
import { lazyRouter } from '../lib/lazyRouter.js'
import { query } from '../db/pool.js'
import { warmJwks } from '../lib/supabase.js'

const router = Router()

// Public platform figures for the landing page.
router.use('/stats', statsRoutes)

router.use('/auth', authRoutes)
router.use(
  '/creators',
  lazyRouter(() => import('../modules/creators.routes.js'))
)

// Your own account: details, picture, preferences, how you are getting on.
router.use(
  '/account',
  lazyRouter(() => import('../modules/account.routes.js'))
)
router.use('/videos', videoRoutes)
router.use('/playback', playbackRoutes)
router.use(
  '/payments',
  lazyRouter(() => import('../modules/payments/payments.routes.js'))
)
router.use(
  '/library',
  lazyRouter(() => import('../modules/library.routes.js'))
)
router.use(
  '/earnings',
  lazyRouter(() => import('../modules/earnings.routes.js'))
)
router.use('/public', publicRoutes)
router.use('/share-card', shareCardRoutes)
router.use(
  '/internal',
  lazyRouter(() => import('../modules/internal.routes.js'))
)
router.use(
  '/share',
  lazyRouter(() => import('../modules/share.routes.js'))
)
router.use('/ads', adsRoutes)
// Staff work — notifications, announcements, the sub-admin team. Mounted
// before /admin so the two never shadow each other.
router.use(
  '/staff',
  lazyRouter(() => import('../modules/staff.routes.js'))
)
router.use(
  '/admin',
  lazyRouter(() => import('../modules/admin.routes.js'))
)

// Every signed-in person has an inbox; announcements land there too.
router.use(
  '/inbox',
  lazyRouter(() => import('../modules/inbox.routes.js'))
)

function assertCronSecret(req) {
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  const provided = req.headers['x-cron-secret'] || bearer || req.query.secret

  if (!env.cronSecret) {
    throw forbidden('CRON_SECRET is not set on the server, so scheduled jobs are disabled')
  }
  if (provided !== env.cronSecret) throw forbidden('Invalid cron secret')
}

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
  assertCronSecret(req)
  res.json(await runPremiereExpiry())
})

router.post('/jobs/premiere-expiry', cronHandler)
router.get('/jobs/premiere-expiry', cronHandler)

/**
 * Keep the serverless function, Postgres pool, and JWKS cache warm.
 *
 * Low traffic otherwise cold-starts almost every visit. Hits `select 1` and
 * fetches Supabase JWKS. Same secret as premiere-expiry.
 *
 * Vercel Hobby only runs crons once a day; `*/5 * * * *` needs Pro.
 */
const keepWarmHandler = asyncHandler(async (req, res) => {
  assertCronSecret(req)
  const db = await query('select 1 as ok')
  const jwks = await warmJwks()
  res.json({ ok: true, db: Number(db?.rowCount) > 0, jwks })
})

router.post('/jobs/keep-warm', keepWarmHandler)
router.get('/jobs/keep-warm', keepWarmHandler)

export default router
