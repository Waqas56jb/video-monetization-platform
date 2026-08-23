import { Router } from 'express'
import { asyncHandler } from '../lib/errors.js'
import { handleShareCard } from '../lib/shareCardServe.js'

const router = Router()

router.get('/:slug', asyncHandler(handleShareCard))
router.head('/:slug', asyncHandler(handleShareCard))

export default router
