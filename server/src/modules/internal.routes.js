import { Router } from 'express'
import { asyncHandler, forbidden } from '../lib/errors.js'
import { env } from '../config/env.js'
import { optionalAuth } from '../middleware/auth.js'
import { warmAllShareCards, warmShareCardById } from './share.routes.js'

const router = Router()

function authorized(req) {
  if (req.user?.role === 'admin') return true
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  const provided = req.headers['x-cron-secret'] || bearer || req.query.secret
  return Boolean(env.cronSecret && provided === env.cronSecret)
}

/**
 * POST /api/internal/share-cards/rebuild
 * Body: { slug } or { all: true }
 */
router.post(
  '/share-cards/rebuild',
  optionalAuth(),
  asyncHandler(async (req, res) => {
    if (!authorized(req)) throw forbidden('Admin or cron secret required')
    const { slug, all } = req.body || {}
    if (all) {
      const result = await warmAllShareCards()
      return res.json({ ok: true, ...result })
    }
    if (!slug) return res.status(400).json({ error: 'slug or all:true required' })
    await warmShareCardById(slug)
    res.json({ ok: true, slug })
  })
)

export default router
