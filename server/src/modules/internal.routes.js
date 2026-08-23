import { Router } from 'express'
import { asyncHandler, forbidden } from '../lib/errors.js'
import { env } from '../config/env.js'
import { optionalAuth } from '../middleware/auth.js'
import { rebuildShareCards } from '../lib/buildShareCard.js'

const router = Router()

function authorized(req) {
  if (req.user?.role === 'admin') return true
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  const provided = req.headers['x-cron-secret'] || bearer || req.query.secret
  return Boolean(env.cronSecret && provided === env.cronSecret)
}

async function handleRebuild(req, res) {
  if (!authorized(req)) throw forbidden('Admin or cron secret required')
  const body = req.body || {}
  const slug = body.slug || req.query.slug
  const all = Boolean(body.all || req.query.all === 'true')
  const stale = Boolean(body.stale || req.query.stale === 'true')

  if (!slug && !all && !stale) {
    return res.status(400).json({ error: 'slug, all:true, or stale:true required' })
  }

  const result = await rebuildShareCards({ slug, all, stale, concurrency: 3 })
  res.json({ ok: true, ...result })
}

/**
 * POST /api/internal/share-cards/rebuild
 * GET  /api/internal/share-cards/rebuild?stale=true  (Vercel cron)
 * Body/query: { slug } | { all: true } | { stale: true }
 */
router.post('/share-cards/rebuild', optionalAuth(), asyncHandler(handleRebuild))
router.get('/share-cards/rebuild', optionalAuth(), asyncHandler(handleRebuild))

export default router
