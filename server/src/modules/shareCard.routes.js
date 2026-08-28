import { Router } from 'express'
import { asyncHandler } from '../lib/errors.js'
import { handleShareCard } from '../lib/shareCardServe.js'
import { SLUG_RE } from '../lib/shareMeta.js'

const router = Router()

function parseSlug(raw) {
  const slug = String(raw || '')
    .replace(/\/ensure$/i, '')
    .replace(/\.jpe?g$/i, '')
    .trim()
  return SLUG_RE.test(slug) ? slug : null
}

router.get('/:slug', asyncHandler(handleShareCard))
router.head('/:slug', asyncHandler(handleShareCard))

/** Safety net — admin preview + rare client self-heal only. */
router.post('/:slug/ensure', asyncHandler(async (req, res) => {
  const slug = parseSlug(req.params.slug)
  if (!slug) return res.status(404).json({ error: 'Not found' })
  const { ensureShareCard } = await import('../lib/buildShareCard.js')
  const result = await ensureShareCard(slug, { budgetMs: 8000 })
  res.json(result)
}))

export default router
