import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { one, many, query } from '../db/pool.js'
import { asyncHandler, badRequest, forbidden, notFound, conflict } from '../lib/errors.js'
import { validate, validateQuery } from '../middleware/validate.js'
import { requireAuth, requireCreator, optionalAuth } from '../middleware/auth.js'
import { getSettings } from '../services/settings.js'
import { resolveAccess, publicVideo, studioVideo } from '../services/entitlement.js'
import { recordAudit, clientIp } from '../services/audit.js'
import * as cf from '../lib/cloudflare.js'
import { env, capabilities } from '../config/env.js'
import { ensureClips } from './playback.routes.js'
import { storeImage, removeImage } from '../services/uploads.js'
import { normalizeCategory, isKnownCategory } from '../lib/categories.js'
import { slugFallbacks } from '../lib/videoKey.js'
import { expireIfDue } from '../jobs/premiere.js'
import { clampFreePreviewSeconds, clampPreviewSql } from '../lib/preview.js'
import { publicWatchUrl } from '../lib/publicWatchUrl.js'

const router = Router()

/**
 * What may be written into `videos.category`.
 *
 * This used to be any string up to 60 characters, which is how the table ended
 * up holding "Documentary" alongside "Documentaries" and showing the client
 * both. Storing the canonical spelling means the filters cannot disagree with
 * each other later, whatever a client sends.
 */
const categoryField = z
  .string()
  .trim()
  .max(60)
  .refine(isKnownCategory, 'Choose one of the listed categories')
  .transform((v) => normalizeCategory(v))
  .optional()

/**
 * The same normalisation when filtering, but forgiving: an old link carrying
 * `?category=Documentary` should still find the documentaries rather than 400.
 * An unrecognised value is left alone and simply matches nothing.
 */
const categoryFilter = z
  .string()
  .trim()
  .max(60)
  .optional()
  .transform((v) => (v ? normalizeCategory(v) || v : undefined))

// Covers are small images passing through on their way to storage; a
// serverless host has no disk worth writing them to.
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 6 * 1024 * 1024, files: 1 } })

/** URL-safe slug. Random suffix only when the title is already taken. */
const slugBase = (title) =>
  title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'video'

const slugify = (title) => `${slugBase(title)}-${Math.random().toString(36).slice(2, 7)}`

async function uniqueSlug(title) {
  const base = slugBase(title)
  let slug = base
  for (let n = 2; n < 80; n++) {
    const taken = await one('select 1 as ok from videos where slug = $1', [slug])
    if (!taken) return slug
    slug = `${base.slice(0, 54)}-${n}`
  }
  return slugify(title)
}

const SELECT_PUBLIC = `
  select v.*, p.full_name as creator_name, p.avatar_url as creator_avatar,
         cp.display_name as creator_display, coalesce(cp.verified, false) as creator_verified
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
  category: categoryFilter,
  access: z.enum(['ppv_forever', 'paid_premiere', 'free_with_ads']).optional(),
  creatorId: z.string().uuid().optional(),
  sort: z.enum(['newest', 'trending', 'popular', 'price_low', 'price_high']).default('newest'),
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
      /**
       * Trending is what people are watching NOW, not what has the most views
       * ever — otherwise the same handful of videos sit at the top of the
       * homepage permanently and nothing new is ever discovered.
       *
       * A purchase counts for more than a view because somebody paying is a far
       * stronger signal than somebody clicking. Lifetime views break ties so a
       * quiet fortnight still produces a sensible order.
       */
      /**
       * Anything an administrator has featured comes first, and everything
       * else is measured.
       *
       * Featured is an editorial decision — a new creator's first release has
       * no fortnight of history and would never surface on merit, however good
       * it is. It sorts ahead rather than being mixed into the score, so the
       * measurement underneath stays honest and un-nudged.
       */
      trending: `v.featured desc, (
        (select count(*) from video_views w
          where w.video_id = v.id and w.created_at > now() - interval '14 days')
        + 5 * (select count(*) from purchases pu
                where pu.video_id = v.id and pu.status = 'active'
                  and pu.purchased_at > now() - interval '14 days')
      ) desc, v.views desc, v.published_at desc nulls last`,
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
  category: categoryField,
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
        await uniqueSlug(title),
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
    category: categoryField,
    accessType: z.enum(['ppv_forever', 'paid_premiere', 'free_with_ads']).optional(),
    priceTzs: z.coerce.number().int().min(0).max(10_000_000).optional(),
    // Any length that still leaves half the video to pay for. 45 seconds of a
    // 3-minute song is fine; 53 seconds of a 54-second clip is not. The half
    // cap is applied below once duration is known.
    freePreviewSeconds: z.coerce.number().int().min(0).max(86400).optional(),
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

    /**
     * The price floor applies to a price the creator is actually setting, and
     * to anything already live. It does NOT apply to a draft they are still
     * filling in.
     *
     * It used to apply to every edit, so a creator adjusting their preview
     * length on a brand-new draft — where the price is still zero because they
     * have not reached that field — was told the minimum price was TZS 200 and
     * their change was thrown away. They had asked about the preview and been
     * refused over something else entirely.
     *
     * Nothing gets past this: submitting for review checks the price properly,
     * and that is the point at which it has to be right.
     */
    const settingAPrice = b.priceTzs != null
    const alreadyLive = video.is_published || video.review_status === 'approved'

    if (accessType !== 'free_with_ads' && (settingAPrice || alreadyLive)) {
      if (price < settings.min_video_price_tzs) {
        throw badRequest(`The minimum price is TZS ${settings.min_video_price_tzs.toLocaleString()}`)
      }
    }
    /**
     * A preview cannot be most of the video.
     *
     * This used to reject the whole request, which meant a creator who uploaded
     * a two-minute clip while the platform default preview was five minutes
     * lost their price, access type and premiere window along with it — every
     * field in the same PATCH was discarded over one they never chose. Clamp it
     * instead and tell them what happened.
     *
     * The ceiling is half the running time, not duration-minus-one. 53s free of
     * a 54s video left nothing to pay for.
     */
    let previewSeconds = b.freePreviewSeconds
    let previewClamped = null
    if (previewSeconds != null && video.duration_seconds) {
      const most = clampFreePreviewSeconds(previewSeconds, video.duration_seconds)
      if (most !== previewSeconds) {
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
         preview_uid          = case
           when $7 is not null and $7 is distinct from free_preview_seconds then null
           else preview_uid
         end,
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
              `A free preview cannot be more than half of the video ` +
              `(${video.duration_seconds}s), so it was shortened from ` +
              `${previewClamped.asked}s to ${previewClamped.applied}s.`,
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
/**
 * What the creator is confirming when they submit.
 *
 * Kept as a constant rather than typed into the form, so the sentence stored
 * against the video is the sentence they were shown — and if the wording is
 * ever changed, older submissions still carry the one that was agreed to.
 */
export const RIGHTS_STATEMENT =
  'I made this content, or I hold every right needed to sell it on MTONYO+ — ' +
  'including the rights of anyone appearing in it and of any music used.'

router.post(
  '/:id/submit',
  requireAuth(),
  requireCreator(),
  validate(
    z.object({
      /**
       * The Creator Agreement says this representation is made on upload. It
       * was never asked for and never recorded, so a copyright claim arrived
       * with no evidence the creator had ever made it. Required to submit.
       */
      confirmRights: z.literal(true, {
        errorMap: () => ({ message: 'Confirm you hold the rights to this content before submitting' }),
      }),
    })
  ),
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
              /* Recorded with the wording that was agreed to, and only set
                 once — the first submission is when the representation was
                 made. */
              rights_confirmed_at = coalesce(rights_confirmed_at, now()),
              rights_statement    = coalesce(rights_statement, $3),
              premiere_days = case when access_type = 'paid_premiere'
                                   then coalesce(premiere_days, $2) else null end,
              free_preview_seconds = ${clampPreviewSql('duration_seconds')}
        where id = $1 returning *`,
      [video.id, settings.default_premiere_days, RIGHTS_STATEMENT]
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
 * A cover the creator chose.
 *
 * Cloudflare picks a frame on its own, and that frame is very often a blur or
 * the black gap between two shots — not something anyone would click. A creator
 * who has made a proper cover should be able to use it.
 *
 * Stored alongside the automatic one rather than replacing it, so removing this
 * falls straight back to the frame. Nothing is lost by trying.
 */
router.post(
  '/:id/thumbnail',
  requireAuth(),
  requireCreator(),
  upload.single('image'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('Choose an image to use as the cover')

    const video = await one('select * from videos where id = $1 and deleted_at is null', [req.params.id])
    if (!video) throw notFound('Video not found')
    if (video.creator_id !== req.user.id) throw forbidden('This is not your video')

    const previous = video.custom_thumbnail_url

    const { url } = await storeImage({
      bucket: 'thumbnails',
      file: req.file,
      userId: req.user.id,
      accessToken: req.accessToken,
    })

    const updated = await one(
      'update videos set custom_thumbnail_url = $2 where id = $1 returning *',
      [video.id, url]
    )

    if (previous) {
      removeImage({ bucket: 'thumbnails', url: previous, accessToken: req.accessToken }).catch(() => {})
    }

    res.json({ video: studioVideo(updated) })
  })
)

/** Drop the custom cover and go back to the frame Cloudflare picked. */
router.delete(
  '/:id/thumbnail',
  requireAuth(),
  requireCreator(),
  asyncHandler(async (req, res) => {
    const video = await one('select * from videos where id = $1 and deleted_at is null', [req.params.id])
    if (!video) throw notFound('Video not found')
    if (video.creator_id !== req.user.id) throw forbidden('This is not your video')

    const previous = video.custom_thumbnail_url
    const updated = await one(
      'update videos set custom_thumbnail_url = null where id = $1 returning *',
      [video.id]
    )
    if (previous) {
      removeImage({ bucket: 'thumbnails', url: previous, accessToken: req.accessToken }).catch(() => {})
    }

    res.json({ video: studioVideo(updated) })
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
                free_preview_seconds = ${clampPreviewSql('coalesce($2, duration_seconds)')}
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
    const keys = slugFallbacks(key)

    let row = await one(
      `${SELECT_PUBLIC} where v.deleted_at is null and (${
        isUuid ? 'v.id = $1' : 'v.id::text = $1 or v.slug = any($2::text[])'
      })`,
      isUuid ? [key] : [key, keys]
    )
    if (!row) throw notFound('Video not found')

    row = await expireIfDue(row)

    const isOwnerOrAdmin = req.user && (req.user.id === row.creator_id || req.user.role === 'admin')
    const access = await resolveAccess({ video: row, userId: req.user?.id, userRole: req.user?.role })

    /**
     * A purchase outlives publication.
     *
     * This gate let through the creator and administrators only, so
     * unpublishing a video took it away from everybody who had paid for it —
     * it stayed listed in their library, because that query has never filtered
     * on publication, and then answered "Video not found" when they pressed
     * play. Somebody who bought it keeps it: that is the whole promise of Pay
     * Once, and the client asked for it explicitly.
     *
     * Deletion is different and still blocks everyone: the row above already
     * requires `deleted_at is null`. Videos are never hard-deleted, and an
     * administrator taking something down for a rights claim has to be able to
     * take it down for real.
     */
    if (!(row.is_published && row.review_status === 'approved') && !isOwnerOrAdmin && !access.owned) {
      throw notFound('Video not found')
    }
    if (row.is_published && row.review_status === 'approved' && row.slug) {
      import('./share.routes.js')
        .then((m) => m.warmShareCardById(row.slug))
        .catch(() => {})
    }
    res.json({
      video: publicVideo(withCreatorName(row), access),
      shareUrl: publicWatchUrl(env.publicWebUrl, row.slug),
      ...(isOwnerOrAdmin ? { studio: studioVideo(row) } : {}),
    })
  })
)

/**
 * Other titles worth opening after this one.
 *
 * Same category first, then more from the same creator, then the rest of the
 * public catalogue — never this video, never unpublished work. The Watch page
 * uses this for the More Like This row; without it a paid title was a dead end.
 */
router.get(
  '/:idOrSlug/related',
  optionalAuth(),
  asyncHandler(async (req, res) => {
    const key = req.params.idOrSlug
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)
    const keys = slugFallbacks(key)

    const row = await one(
      `${SELECT_PUBLIC} where v.deleted_at is null and (${
        isUuid ? 'v.id = $1' : 'v.id::text = $1 or v.slug = any($2::text[])'
      })`,
      isUuid ? [key] : [key, keys]
    )
    if (!row) throw notFound('Video not found')

    const isOwnerOrAdmin = req.user && (req.user.id === row.creator_id || req.user.role === 'admin')
    const access = await resolveAccess({ video: row, userId: req.user?.id, userRole: req.user?.role })
    if (!(row.is_published && row.review_status === 'approved') && !isOwnerOrAdmin && !access.owned) {
      throw notFound('Video not found')
    }

    const related = await many(
      `${SELECT_PUBLIC}
        where v.is_published = true
          and v.review_status = 'approved'
          and v.deleted_at is null
          and v.id <> $1
        order by
          case
            when $2::text is not null and v.category = $2 and v.creator_id = $3 then 0
            when $2::text is not null and v.category = $2 then 1
            when v.creator_id = $3 then 2
            else 3
          end,
          v.featured desc,
          v.views desc,
          v.published_at desc nulls last
        limit 8`,
      [row.id, row.category || null, row.creator_id]
    )

    res.json({ videos: related.map((r) => publicVideo(withCreatorName(r))) })
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

    // `videos.views` is maintained by a trigger on this insert (migration 006).
    // Bumping it here as well would count every view twice.
    await query(
      `insert into video_views (video_id, user_id, seconds_watched, reached_paywall)
       values ($1,$2,$3,$4)`,
      [video.id, req.user?.id ?? null, req.body.secondsWatched, req.body.reachedPaywall]
    )
    res.status(202).json({ ok: true })
  })
)

/**
 * Report a video.
 *
 * The Copyright & Reporting page tells people to write to support, and until
 * now that was the only route — an email address on a policy page, with nothing
 * connecting it to the moderation queue staff actually work from. Somebody who
 * finds their own film being sold here should be able to say so from the video.
 *
 * Open to signed-out visitors on purpose. Requiring an account to report
 * infringement protects nobody except the person infringing. The reporter is
 * recorded when we know who they are, and one open report per person per video
 * is enough — hammering the button should not bury the queue.
 */
router.post(
  '/:id/report',
  optionalAuth(),
  validate(
    z.object({
      reason: z.enum(['copyright', 'inappropriate', 'misleading', 'illegal', 'other']),
      detail: z.string().trim().max(1500).optional(),
      /* So we can come back to somebody who is not signed in. */
      email: z.string().email().optional().or(z.literal('')),
    })
  ),
  asyncHandler(async (req, res) => {
    const video = await one(
      `select id, title, creator_id from videos
        where deleted_at is null and (id::text = $1 or slug = any($2::text[]))`,
      [req.params.id, slugFallbacks(req.params.id)]
    )
    if (!video) throw notFound('Video not found')

    const { reason, detail, email } = req.body

    /* A second open report from the same person says nothing new. Answer as
       though it worked — they did what was asked of them. */
    if (req.user) {
      const existing = await one(
        `select id from content_reports
          where video_id = $1 and reporter_id = $2 and status = 'open'`,
        [video.id, req.user.id]
      )
      if (existing) {
        return res.status(202).json({
          ok: true,
          message: 'You have already reported this video — our team is looking at it.',
        })
      }
    }

    const report = await one(
      `insert into content_reports
         (video_id, reporter_id, reporter_email, reason, detail, ip)
       values ($1,$2,$3,$4::report_reason,$5,$6) returning id`,
      [
        video.id,
        req.user?.id ?? null,
        (email || req.user?.email || null) ?? null,
        reason,
        detail || null,
        clientIp(req),
      ]
    )

    await recordAudit({
      actorId: req.user?.id ?? null,
      action: 'CONTENT_REPORTED',
      entityType: 'video',
      entityId: video.id,
      detail: { reason, title: video.title },
      ip: clientIp(req),
    })

    res.status(201).json({
      ok: true,
      reportId: report.id,
      message: 'Thank you — our moderation team will review this.',
    })
  })
)

export default router
export { slugify, SELECT_PUBLIC, withCreatorName }
