import { Router } from 'express'
import { z } from 'zod'
import { asyncHandler } from '../lib/errors.js'
import { validate, validateQuery } from '../middleware/validate.js'
import { requireAuth } from '../middleware/auth.js'
import { listNotifications, unreadCount, markRead, shapeNotification } from '../services/notify.js'

/**
 * Everyone's inbox — viewers and creators, not just staff.
 *
 * An announcement addressed to all creators has to land somewhere they will
 * actually see it, and so does "your video was approved". Same table as the
 * admin's inbox; the only difference is whose rows come back.
 */
const router = Router()
router.use(requireAuth())

router.get(
  '/',
  validateQuery(
    z.object({
      unread: z.coerce.boolean().optional(),
      limit: z.coerce.number().int().min(1).max(100).default(30),
      offset: z.coerce.number().int().min(0).default(0),
    })
  ),
  asyncHandler(async (req, res) => {
    const q = req.validatedQuery
    const [rows, unread] = await Promise.all([
      listNotifications({
        userId: req.user.id,
        unreadOnly: q.unread === true,
        limit: q.limit,
        offset: q.offset,
      }),
      unreadCount(req.user.id),
    ])
    res.json({ notifications: rows.map(shapeNotification), unread })
  })
)

router.get(
  '/unread-count',
  asyncHandler(async (req, res) => res.json({ unread: await unreadCount(req.user.id) }))
)

router.post(
  '/read',
  validate(z.object({ ids: z.array(z.string().uuid()).optional() })),
  asyncHandler(async (req, res) => res.json({ ok: true, unread: await markRead(req.user.id, req.body.ids || null) }))
)

export default router
