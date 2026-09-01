import { Router } from 'express'
import { asyncHandler } from '../lib/errors.js'
import { requireAuth } from '../middleware/auth.js'
import { followCreator, followingIds, unfollowCreator } from '../lib/follows.js'

const router = Router()

/**
 * Which creators this viewer follows.
 *
 * Declared before `/:id/follow` only for readability — Express matches on the
 * path, and `following` is not a UUID, so there is no shadowing either way.
 *
 * One request for a whole page of cards. The alternative, asking per card, is
 * eight requests on Home and more on Explore, against a 120-per-minute limiter.
 */
router.get(
  '/following',
  requireAuth(),
  asyncHandler(async (req, res) => {
    res.json({ creatorIds: await followingIds(req.user.id) })
  })
)

router.post(
  '/:id/follow',
  requireAuth(),
  asyncHandler(async (req, res) => {
    res.json(await followCreator(req.user.id, req.params.id))
  })
)

router.delete(
  '/:id/follow',
  requireAuth(),
  asyncHandler(async (req, res) => {
    res.json(await unfollowCreator(req.user.id, req.params.id))
  })
)

export default router
