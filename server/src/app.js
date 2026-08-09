/**
 * The Express app itself, with no assumption about how it is being run.
 *
 * Kept apart from the thing that listens on a port because the two are
 * genuinely different jobs: locally we `listen`, and on a serverless host the
 * platform hands us a request and there is no port to bind at all. Calling
 * listen() there is what makes a deployment appear to start and then answer
 * nothing.
 */
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import rateLimit from 'express-rate-limit'

import { env, capabilities, missingConfig } from './config/env.js'
import { log } from './lib/logger.js'
import { query, closePool } from './db/pool.js'
import routes from './routes/index.js'
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js'
import { getSettings } from './services/settings.js'

const app = express()

app.set('trust proxy', 1)
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))

/**
 * Which origins may call this API.
 *
 * In development anything on localhost is allowed, whatever port it is on.
 * Vite moves to the next free port whenever its default is taken — open the
 * public app twice and it is suddenly on 5176 — and a hard-coded list of two
 * ports means the browser starts getting refused for no reason a developer can
 * see. The rejection arrives as an opaque network failure, so it looks exactly
 * like the API being down. That cost an afternoon once; it is not worth
 * repeating to protect a machine that is only talking to itself.
 *
 * In production the allow-list is exact, and nothing is inferred.
 */
const LOCALHOST = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/

function isAllowedOrigin(origin) {
  if (!origin) return true // server-to-server and mobile webviews send none
  if (!env.isProd && LOCALHOST.test(origin)) return true
  if (!env.corsOrigins.length) return true // nothing configured: allow, and warn at boot
  return env.corsOrigins.includes(origin)
}

app.use(
  cors({
    origin(origin, cb) {
      // Never throw here. An error inside this callback becomes a 500 with no
      // usable body, which tells whoever is debugging nothing at all. Refusing
      // the CORS headers is enough; the explicit 403 below explains why.
      cb(null, isAllowedOrigin(origin))
    },
    credentials: true,
  })
)

/**
 * Say plainly when an origin is blocked.
 *
 * Without this the browser reports a blocked request as a generic network
 * failure — identical to the server being offline — and the app tells the user
 * to check their connection while the server sits there working perfectly.
 */
app.use((req, res, next) => {
  const origin = req.headers.origin
  if (isAllowedOrigin(origin)) return next()

  res.status(403).json({
    error: {
      code: 'ORIGIN_NOT_ALLOWED',
      message:
        `This API does not accept requests from ${origin}. ` +
        `Add it to CORS_ORIGINS on the server and redeploy.`,
      allowed: env.corsOrigins,
    },
  })
})

// Keep the raw body so webhook signatures can be verified byte-for-byte.
app.use(
  express.json({
    limit: '1mb',
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString('utf8')
    },
  })
)
app.use(express.urlencoded({ extended: true }))
app.use(morgan(env.isProd ? 'combined' : 'dev'))

app.use(
  '/api',
  rateLimit({
    windowMs: 60_000,
    limit: env.isProd ? 120 : 1000,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: { message: 'Too many requests — slow down a moment', code: 'RATE_LIMIT' } },
  })
)

/* ----------------------------------------------------------------- health */
app.get('/health', async (_req, res) => {
  let db = 'unknown'
  if (capabilities.database) {
    try {
      await query('select 1')
      db = 'connected'
    } catch (err) {
      db = `error: ${err.message}`
    }
  } else {
    db = 'not configured'
  }

  res.json({
    ok: true,
    service: 'mtonyo-api',
    env: env.nodeEnv,
    time: new Date().toISOString(),
    database: db,
    capabilities,

    /**
     * Where this API thinks its front ends live.
     *
     * Not secret — these are public website addresses — and knowing them
     * answers the question that is otherwise unanswerable from outside: which
     * site will the links inside password-reset and staff-invitation emails
     * point at? Left on localhost by mistake, every one of those emails sends
     * the recipient to their own machine, and nobody finds out until somebody
     * tries to use one.
     */
    urls: {
      publicApp: env.publicWebUrl,
      adminApp: env.adminWebUrl,
      allowedOrigins: env.corsOrigins,
    },

    ...(missingConfig().length ? { needsConfiguration: missingConfig() } : {}),
  })
})

app.get('/', (_req, res) =>
  res.json({
    service: 'MTONYO+ API',
    docs: '/api',
    health: '/health',
  })
)

/* ---------------------------------------------------------- route listing */
app.get('/api', (_req, res) => {
  res.json({
    service: 'MTONYO+ API',
    groups: {
      auth: ['POST /api/auth/register', 'POST /api/auth/login', 'POST /api/auth/refresh',
             'GET /api/auth/me', 'PATCH /api/auth/me', 'POST /api/auth/become-creator',
             'GET /api/auth/creators/:id'],
      videos: ['GET /api/videos', 'GET /api/videos/categories', 'GET /api/videos/mine',
               'POST /api/videos', 'PATCH /api/videos/:id', 'POST /api/videos/:id/submit',
               'POST /api/videos/:id/request-deletion', 'GET /api/videos/:idOrSlug',
               'POST /api/videos/:id/view'],
      playback: ['GET /api/playback/:id/playback', 'POST /api/playback/webhooks/cloudflare'],
      payments: ['POST /api/payments/initiate', 'GET /api/payments/:id', 'GET /api/payments',
                 'POST /api/payments/webhook/:provider', 'POST /api/payments/:id/simulate'],
      library: ['GET /api/library', 'GET /api/library/purchases', 'GET /api/library/entitlement/:videoId'],
      earnings: ['GET /api/earnings', 'GET /api/earnings/transactions', 'GET /api/earnings/withdrawals',
                 'POST /api/earnings/withdrawals', 'DELETE /api/earnings/withdrawals/:id'],
      share: ['GET /api/share/:id', 'POST /api/share/:id/generate'],
      ads: ['GET /api/ads/preroll/:videoId', 'POST /api/ads/impression', 'GET /api/ads/campaigns'],
      admin: ['GET /api/admin/overview', 'GET /api/admin/review', 'POST /api/admin/review/:id/approve',
              'POST /api/admin/review/:id/reject', 'GET /api/admin/videos', 'PATCH /api/admin/videos/:id',
              'POST /api/admin/videos/:id/unpublish', 'POST /api/admin/videos/:id/publish',
              'DELETE /api/admin/videos/:id', 'GET /api/admin/deletion-requests',
              'POST /api/admin/deletion-requests/:id/decide', 'GET /api/admin/users',
              'POST /api/admin/users/:id/status', 'GET /api/admin/creators',
              'POST /api/admin/creators/:id/verify', 'POST /api/admin/creators/:id/split',
              'GET /api/admin/payments', 'GET /api/admin/withdrawals',
              'POST /api/admin/withdrawals/:id/decide', 'GET /api/admin/revenue',
              'GET /api/admin/settings', 'PATCH /api/admin/settings', 'GET /api/admin/audit',
              'GET /api/admin/ads', 'POST /api/admin/ads', 'PATCH /api/admin/ads/:id',
              'POST /api/admin/jobs/premiere-expiry'],
      jobs: ['POST /api/jobs/premiere-expiry (x-cron-secret)'],
    },
  })
})

app.use('/api', routes)
app.use(notFoundHandler)
app.use(errorHandler)

export default app
