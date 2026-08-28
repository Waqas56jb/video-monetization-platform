import { Router } from 'express'
import { asyncHandler } from '../lib/errors.js'
import { requireAuth } from '../middleware/auth.js'
import { followCreator, unfollowCreator } from '../lib/follows.js'

const router = Router()

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
