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

app.use(
  cors({
    origin(origin, cb) {
      // Server-to-server and mobile webviews send no Origin header.
      if (!origin || !env.corsOrigins.length || env.corsOrigins.includes(origin)) return cb(null, true)
      cb(new Error(`Origin ${origin} is not allowed`))
    },
    credentials: true,
  })
)

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

/* ------------------------------------------------------------------- boot */
const server = app.listen(env.port, async () => {
  log.ok(`MTONYO+ API listening on http://localhost:${env.port}  (${env.nodeEnv})`)

  const missing = missingConfig()
  if (missing.length) {
    log.warn('running with reduced capability:')
    missing.forEach((m) => log.warn(`  · ${m}`))
  }

  if (capabilities.database) {
    try {
      await query('select 1')
      const s = await getSettings()
      log.ok(`database connected · split ${s.creator_split_percent}/${100 - s.creator_split_percent}`)
    } catch (err) {
      log.error('database check failed:', err.message)
    }
  }
})

const shutdown = async (signal) => {
  log.info(`${signal} — shutting down`)
  server.close(async () => {
    await closePool().catch(() => {})
    process.exit(0)
  })
  setTimeout(() => process.exit(1), 8000).unref()
}
process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

export default app
