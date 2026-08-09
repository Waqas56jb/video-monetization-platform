import { Router } from 'express'
import { z } from 'zod'
import { one, many, query, transaction } from '../db/pool.js'
import { asyncHandler, badRequest, forbidden, notFound, conflict } from '../lib/errors.js'
import { validate, validateQuery } from '../middleware/validate.js'
import { requireAuth, requireCreator, optionalAuth } from '../middleware/auth.js'
import { getSettings } from '../services/settings.js'
import { resolveAccess, publicVideo, studioVideo } from '../services/entitlement.js'
import { recordAudit, clientIp } from '../services/audit.js'
import * as cf from '../lib/cloudflare.js'
import { env, capabilities } from '../config/env.js'
import { ensureClips } from './playback.routes.js'

const router = Router()

/** URL-safe slug, with a short suffix so titles can repeat. */
const slugify = (title) =>
  `${title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)}-${Math.random().toString(36).slice(2, 7)}`

const SELECT_PUBLIC = `
  select v.*, p.full_name as creator_name, p.avatar_url as creator_avatar,
         cp.display_name as creator_display
    from videos v
    join profiles p on p.id = v.creator_id
    left join creator_profiles cp on cp.user_id = v.creator_id`

const withCreatorName = (row) =>
  row ? { ...row, creator_name: row.creator_display || row.creator_name } : row

/* ======================================================================
   PUBLIC CATALOGUE
   ====================================================================== */

const listQuery = z.object({
  q: z.string().trim().max(120).optional(),
  category: z.string().trim().max(60).optional(),
  access: z.enum(['ppv_forever', 'paid_premiere', 'free_with_ads']).optional(),
  creatorId: z.string().uuid().optional(),
  sort: z.enum(['newest', 'popular', 'price_low', 'price_high']).default('newest'),
  limit: z.coerce.number().int().min(1).max(50).default(24),
  offset: z.coerce.number().int().min(0).default(0),
})

router.get(
  '/',
  optionalAuth(),
  validateQuery(listQuery),
  asyncHandler(async (req, res) => {
    const { q, category, access, creatorId, sort, limit, offset } = req.validatedQuery
    const where = [`v.is_published = true`, `v.review_status = 'approved'`, `v.deleted_at is null`]
    const params = []

    if (q) {
      params.push(`%${q}%`)
      where.push(`(v.title ilike $${params.length} or v.description ilike $${params.length}
                   or coalesce(cp.display_name, p.full_name) ilike $${params.length})`)
    }
    if (category) { params.push(category); where.push(`v.category = $${params.length}`) }
    if (access) { params.push(access); where.push(`v.access_type = $${params.length}`) }
    if (creatorId) { params.push(creatorId); where.push(`v.creator_id = $${params.length}`) }

    const order = {
      newest: 'v.published_at desc nulls last',
      popular: 'v.views desc',
      price_low: 'v.price_tzs asc',
      price_high: 'v.price_tzs desc',
    }[sort]

    params.push(limit, offset)
    const rows = await many(
      `${SELECT_PUBLIC} where ${where.join(' and ')}
       order by ${order} limit $${params.length - 1} offset $${params.length}`,
      params
    )

    const total = await one(
      `select count(*)::int as n from videos v
         join profiles p on p.id = v.creator_id
         left join creator_profiles cp on cp.user_id = v.creator_id
        where ${where.join(' and ')}`,
      params.slice(0, params.length - 2)
    )

    res.json({
      videos: rows.map((r) => publicVideo(withCreatorName(r))),
      total: total?.n ?? 0,
      limit,
      offset,
    })
  })
)

router.get(
  '/categories',
  asyncHandler(async (_req, res) => {
    const rows = await many(
      `select category, count(*)::int as count from videos
        where is_published and review_status = 'approved' and deleted_at is null
          and category is not null
        group by category order by count desc`
    )
    res.json({ categories: rows })
  })
)

/* ======================================================================
   CREATOR STUDIO  (must be declared before the /:idOrSlug route)
   ====================================================================== */

router.get(
  '/mine',
  requireAuth(),
  requireCreator(),
  asyncHandler(async (req, res) => {
    const rows = await many(
      `select * from videos where creator_id = $1 order by created_at desc`,
      [req.user.id]
    )
    res.json({ videos: rows.map(studioVideo) })
  })
)

const createSchema = z.object({
  title: z.string().trim().min(3, 'Give the video a title').max(160),
  description: z.string().trim().max(4000).optional(),
  category: z.string().trim().max(60).optional(),
  maxDurationSeconds: z.coerce.number().int().min(10).max(21600).optional(),
})

/**
 * Step 1 of publishing: create the record and hand back a one-time Cloudflare
 * upload URL. The browser uploads straight to Cloudflare — the file never
 * passes through this server.
 */
router.post(
  '/',
  requireAuth(),
  requireCreator(),
  validate(createSchema),
  asyncHandler(async (req, res) => {
    const { title, description, category, maxDurationSeconds } = req.body
    const settings = await getSettings()

    let upload = null
    if (capabilities.cloudflareStream) {
      upload = await cf.createDirectUpload({
        maxDurationSeconds: maxDurationSeconds || 7200,
        creatorId: req.user.id,
        meta: { name: title },
      })
    }

    const video = await one(
      `insert into videos
         (creator_id, slug, title, description, category, cloudflare_uid,
          free_preview_seconds, review_status, state)
       values ($1,$2,$3,$4,$5,$6,$7,'draft','processing')
       returning *`,
      [
        req.user.id,
        slugify(title),
        title,
        description || null,
        category || null,
        upload?.uid ?? null,
        settings.default_preview_seconds,
      ]
    )

    res.status(201).json({
      video: studioVideo(video),
      upload: upload
        ? { url: upload.uploadUrl, uid: upload.uid }
        : { url: null, uid: null, note: 'Cloudflare Stream is not configured yet' },
    })
  })
)

const updateSchema = z
  .object({
    title: z.string().trim().min(3).max(160).optional(),
    description: z.string().trim().max(4000).optional(),
    category: z.string().trim().max(60).optional(),
    accessType: z.enum(['ppv_forever', 'paid_premiere', 'free_with_ads']).optional(),
    priceTzs: z.coerce.number().int().min(0).max(10_000_000).optional(),
    freePreviewSeconds: z.coerce.number().int().min(0).max(7200).optional(),
    // Per video, never a platform-wide number: 30 / 60 / 90 / anything.
    premiereDays: z.coerce.number().int().min(1).max(3650).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' })

/** Edit a video. Only while it is not approved — after that an admin decides. */
router.patch(
  '/:id',
  requireAuth(),
  requireCreator(),
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    const video = await one('select * from videos where id = $1 and deleted_at is null', [req.params.id])
    if (!video) throw notFound('Video not found')
    if (video.creator_id !== req.user.id && req.user.role !== 'admin') {
      throw forbidden('This is not your video')
    }
    if (video.review_status === 'pending_review' && req.user.role !== 'admin') {
      throw conflict('This video is being reviewed and cannot be edited right now')
    }

    const b = req.body
    const settings = await getSettings()

    const accessType = b.accessType ?? video.access_type
    const price = b.priceTzs ?? video.price_tzs

    if (accessType !== 'free_with_ads') {
      if (price < settings.min_video_price_tzs) {
        throw badRequest(`The minimum price is TZS ${settings.min_video_price_tzs.toLocaleString()}`)
      }
    }
    /**
     * A preview cannot be longer than the video it previews.
     *
     * This used to reject the whole request, which meant a creator who uploaded
     * a two-minute clip while the platform default preview was five minutes
     * lost their price, access type and premiere window along with it — every
     * field in the same PATCH was discarded over one they never chose. Clamp it
     * instead and tell them what happened.
     */
    let previewSeconds = b.freePreviewSeconds
    let previewClamped = null
    if (previewSeconds != null && video.duration_seconds) {
      const most = Math.max(0, video.duration_seconds - 1)
      if (previewSeconds > most) {
        previewClamped = { asked: previewSeconds, applied: most }
        previewSeconds = most
      }
    }

    const updated = await one(
      `update videos set
         title                = coalesce($2, title),
         description          = coalesce($3, description),
         category             = coalesce($4, category),
         access_type          = coalesce($5, access_type),
         price_tzs            = case when coalesce($5, access_type) = 'free_with_ads'
                                     then 0 else coalesce($6, price_tzs) end,
         free_preview_seconds = coalesce($7, free_preview_seconds),
         premiere_days        = coalesce($8, premiere_days),
         ads_enabled          = (coalesce($5, access_type) = 'free_with_ads')
       where id = $1 returning *`,
      [
        video.id,
        b.title ?? null,
        b.description ?? null,
        b.category ?? null,
        b.accessType ?? null,
        b.priceTzs ?? null,
        previewSeconds ?? null,
        b.premiereDays ?? null,
      ]
    )

    res.json({
      video: studioVideo(updated),
      ...(previewClamped
        ? {
            notice:
              `This video is only ${video.duration_seconds}s long, so the free preview was ` +
              `shortened from ${previewClamped.asked}s to ${previewClamped.applied}s.`,
          }
        : {}),
    })
  })
)

/**
 * Step 2: submit for review.
 *
 * A creator can only ever reach `pending_review` — publication is an admin
 * decision, and the database refuses anything else.
 */
router.post(
  '/:id/submit',
  requireAuth(),
  requireCreator(),
  asyncHandler(async (req, res) => {
    const video = await one('select * from videos where id = $1 and deleted_at is null', [req.params.id])
    if (!video) throw notFound('Video not found')
    if (video.creator_id !== req.user.id) throw forbidden('This is not your video')
    if (video.review_status === 'pending_review') throw conflict('This video is already awaiting review')
    if (video.review_status === 'approved') throw conflict('This video is already approved')
    if (!video.cloudflare_uid) throw badRequest('Upload the video file before submitting it')
    if (video.state !== 'ready' && capabilities.cloudflareStream) {
      throw conflict('The video is still processing — try again in a moment')
    }

    const settings = await getSettings()
    if (video.access_type !== 'free_with_ads' && video.price_tzs < settings.min_video_price_tzs) {
      throw badRequest(`Set a price of at least TZS ${settings.min_video_price_tzs.toLocaleString()}`)
    }

    const updated = await one(
      `update videos
          set review_status = 'pending_review',
              submitted_at = now(),
              rejection_reason = null,
              premiere_days = case when access_type = 'paid_premiere'
                                   then coalesce(premiere_days, $2) else null end
        where id = $1 returning *`,
      [video.id, settings.default_premiere_days]
    )

    await recordAudit({
      actorId: req.user.id,
      action: 'SUBMITTED_FOR_REVIEW',
      entityType: 'video',
      entityId: video.id,
      detail: { title: video.title },
      ip: clientIp(req),
    })

    res.json({
      video: studioVideo(updated),
      message: 'Submitted for review — the MTONYO+ team will approve it shortly',
    })
  })
)

/**
 * Where has Cloudflare got to with this file?
 *
 * The webhook is the proper answer to that question, but it needs a public URL
 * — which does not exist on a laptop, and may not exist on the day someone
 * first deploys. So the upload screen polls this instead: it asks Cloudflare
 * directly, writes what it learns, and cuts the clips the moment the source is
 * ready. Whichever arrives first, the webhook or a poll, the outcome is the
 * same and neither undoes the other.
 */
router.get(
  '/:id/status',
  requireAuth(),
  requireCreator(),
  asyncHandler(async (req, res) => {
    const video = await one('select * from videos where id = $1 and deleted_at is null', [req.params.id])
    if (!video) throw notFound('Video not found')
    if (video.creator_id !== req.user.id) throw forbidden('This is not your video')

    // Already settled — no need to trouble Cloudflare again.
    if (video.state === 'ready' || video.state === 'failed' || !video.cloudflare_uid) {
      return res.json({
        state: video.state,
        progress: video.state === 'ready' ? 100 : 0,
        video: studioVideo(video),
      })
    }

    if (!capabilities.cloudflareStream) {
      return res.json({ state: video.state, progress: 0, video: studioVideo(video) })
    }

    let remote = null
    try {
      remote = await cf.getVideo(video.cloudflare_uid)
    } catch {
      // The upload may not have started yet; that is not an error worth
      // showing anyone. Report what we already know and let them poll again.
      return res.json({ state: video.state, progress: 0, video: studioVideo(video) })
    }

    if (!remote) return res.json({ state: video.state, progress: 0, video: studioVideo(video) })

    const remoteState = remote.status?.state
    const progress = Math.round(Number(remote.status?.pctComplete ?? 0))

    if (remote.readyToStream) {
      /**
       * The platform default preview is set when the record is created, long
       * before anyone knows how long the video is. Now that we do, bring it
       * inside the running time — a five-minute preview of a two-minute clip
       * is not a setting anybody chose, and left alone it would block the
       * creator's next save.
       */
      const updated = await one(
        `update videos
            set state = 'ready',
                duration_seconds = coalesce($2, duration_seconds),
                thumbnail_url    = coalesce($3, thumbnail_url),
                free_preview_seconds = least(
                  free_preview_seconds,
                  greatest(coalesce($2, duration_seconds, 0) - 1, 0)
                )
          where id = $1 returning *`,
        [video.id, Math.floor(remote.duration || 0) || null, remote.thumbnail || null]
      )
      // Cut the free preview and the social promo now the source exists.
      ensureClips(video.id).catch(() => {})
      return res.json({ state: 'ready', progress: 100, video: studioVideo(updated) })
    }

    if (remoteState === 'error') {
      const message =
        remote.status?.errorReasonText ||
        'Cloudflare could not process this file. Try exporting it as an MP4 and uploading again.'
      const updated = await one(
        `update videos set state = 'failed' where id = $1 returning *`,
        [video.id]
      )
      return res.json({ state: 'failed', progress, error: message, video: studioVideo(updated) })
    }

    res.json({ state: 'processing', progress, video: studioVideo(video) })
  })
)

/**
 * A creator asks for removal; they never get to delete. Anyone who paid keeps
 * their access, so the decision belongs to an admin.
 */
router.post(
  '/:id/request-deletion',
  requireAuth(),
  requireCreator(),
  validate(z.object({ reason: z.string().trim().max(500).optional() })),
  asyncHandler(async (req, res) => {
    const video = await one('select * from videos where id = $1 and deleted_at is null', [req.params.id])
    if (!video) throw notFound('Video not found')
    if (video.creator_id !== req.user.id) throw forbidden('This is not your video')

    const existing = await one(
      `select id from video_deletion_requests where video_id = $1 and status = 'pending'`,
      [video.id]
    )
    if (existing) throw conflict('A removal request is already pending for this video')

    const buyers = await one(
      `select count(*)::int as n from purchases where video_id = $1 and status = 'active'`,
      [video.id]
    )

    const request = await one(
      `insert into video_deletion_requests (video_id, requested_by, reason)
       values ($1,$2,$3) returning *`,
      [video.id, req.user.id, req.body.reason || null]
    )

    res.status(201).json({
      request,
      buyers: buyers.n,
      message:
        buyers.n > 0
          ? `${buyers.n} customer(s) own permanent access — an admin will review this request`
          : 'Removal requested — an admin will review it',
    })
  })
)

/* ======================================================================
   ONE VIDEO  (public, by id or slug — this is the deep-link target)
   ====================================================================== */

router.get(
  '/:idOrSlug',
  optionalAuth(),
  asyncHandler(async (req, res) => {
    const key = req.params.idOrSlug
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)

    const row = await one(
      `${SELECT_PUBLIC} where ${isUuid ? 'v.id = $1' : 'v.slug = $1'} and v.deleted_at is null`,
      [key]
    )
    if (!row) throw notFound('Video not found')

    const isOwnerOrAdmin = req.user && (req.user.id === row.creator_id || req.user.role === 'admin')
    if (!(row.is_published && row.review_status === 'approved') && !isOwnerOrAdmin) {
      throw notFound('Video not found')
    }

    const access = await resolveAccess({ video: row, userId: req.user?.id, userRole: req.user?.role })
    res.json({
      video: publicVideo(withCreatorName(row), access),
      shareUrl: `${env.publicWebUrl}/watch/${row.slug || row.id}`,
      ...(isOwnerOrAdmin ? { studio: studioVideo(row) } : {}),
    })
  })
)

/** Record a view; used for the "reached the paywall" conversion metric. */
router.post(
  '/:id/view',
  optionalAuth(),
  validate(
    z.object({
      secondsWatched: z.coerce.number().int().min(0).max(86400).default(0),
      reachedPaywall: z.boolean().default(false),
    })
  ),
  asyncHandler(async (req, res) => {
    const video = await one('select id from videos where id = $1 and deleted_at is null', [req.params.id])
    if (!video) throw notFound('Video not found')

    await transaction(async (client) => {
      await client.query(
        `insert into video_views (video_id, user_id, seconds_watched, reached_paywall)
         values ($1,$2,$3,$4)`,
        [video.id, req.user?.id ?? null, req.body.secondsWatched, req.body.reachedPaywall]
      )
      await client.query('update videos set views = views + 1 where id = $1', [video.id])
    })
    res.status(202).json({ ok: true })
  })
)

export default router
export { slugify, SELECT_PUBLIC, withCreatorName }
