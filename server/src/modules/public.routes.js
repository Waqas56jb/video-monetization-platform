import { Router } from 'express'
import { asyncHandler } from '../lib/errors.js'
import { loadShareMeta } from '../lib/shareMeta.js'

const router = Router()

/**
 * Lightweight metadata for link previews — no clip payload, no Sharp work.
 * GET /api/public/videos/:slug/share-meta
 */
router.get(
  '/videos/:slug/share-meta',
  asyncHandler(async (req, res) => {
    const meta = await loadShareMeta(req.params.slug)
    if (!meta) {
      res.setHeader('Cache-Control', 'private, no-store')
      return res.status(404).json({ isPublic: false })
    }
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.json(meta)
  })
)

export default router
