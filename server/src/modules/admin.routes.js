import { Router } from 'express'
import { z } from 'zod'
import { one, many, query, transaction } from '../db/pool.js'
import { asyncHandler, badRequest, conflict, notFound } from '../lib/errors.js'
import { validate, validateQuery } from '../middleware/validate.js'
import { requireAuth, requireStaff, requireAdmin } from '../middleware/auth.js'
import { getSettings, updateSettings, applySplit, splitPercentFor } from '../services/settings.js'
import { recordAudit, recordStaffAction, clientIp } from '../services/audit.js'
import { notify } from '../services/notify.js'
import { studioVideo } from '../services/entitlement.js'
import { runPremiereExpiry } from '../jobs/premiere.js'
import { ensureClips } from './playback.routes.js'
import { campaignPerformance, microToTzs } from '../services/ads.js'
import { createDirectUpload as cfCreateDirectUpload, getVideo as cfVideoDetails } from '../lib/cloudflare.js'
import { capabilities } from '../config/env.js'

const router = Router()

/**
 * Staff — admin or sub-admin — may run the platform: review content, decide
 * withdrawals, manage ads. Anything to do with *accounts* carries its own
 * requireAdmin() below, because a sub-admin must not see or change them.
 */
router.use(requireAuth(), requireStaff())

/** The database guard reads this, and it must be the caller's real role. */
const asAdmin = (req) => ({ actorRole: req.user.role, actorId: req.user.id })

/** How this person should be named in a log line a human will read. */
const who = (req) => req.user.full_name || req.user.email

/**
 * An optional filter that understands "show me everything".
 *
 * A dropdown's All option can reach us as an absent parameter, an empty string,
 * or the literal word "all", depending on the control that sent it. A strict
 * enum rejects the last two with a 400, and the screen then renders as though
 * the platform had no users — the widest possible filter producing the emptiest
 * possible result. Treat all three as "no filter" instead.
 */
const anyOf = (values) =>
  z.preprocess(
    (v) => (v == null || v === '' || String(v).toLowerCase() === 'all' ? undefined : v),
    z.enum(values).optional()
  )

/* ======================================================================
   OVERVIEW
   ====================================================================== */
router.get(
  '/overview',
  asyncHandler(async (_req, res) => {
    const [users, videos, money, pending] = await Promise.all([
      one(`select count(*)::int as total,
                  count(*) filter (where role = 'creator')::int as creators,
                  count(*) filter (where status = 'blocked')::int as blocked
             from profiles`),
      one(`select count(*)::int as total,
                  count(*) filter (where is_published)::int as published,
                  count(*) filter (where access_type = 'free_with_ads')::int as free,
                  count(*) filter (where review_status = 'pending_review')::int as pending_review
             from videos where deleted_at is null`),
      one(`select coalesce(sum(gross_tzs),0)::int   as gross,
                  coalesce(sum(creator_tzs),0)::int as creators,
                  coalesce(sum(platform_tzs),0)::int as platform
             from earnings`),
      one(`select count(*) filter (where status = 'pending')::int as withdrawals,
                  (select count(*)::int from video_deletion_requests where status = 'pending') as deletions
             from withdrawals`),
    ])

    res.json({
      users,
      videos,
      revenue: {
        grossTzs: money.gross,
        creatorsTzs: money.creators,
        platformTzs: money.platform,
      },
      queues: {
        pendingReview: videos.pending_review,
        pendingWithdrawals: pending.withdrawals,
        pendingDeletions: pending.deletions,
      },
    })
  })
)

router.get(
  '/activity',
  asyncHandler(async (_req, res) => {
    const rows = await many(
      `select a.*, p.full_name as actor_name
         from audit_log a left join profiles p on p.id = a.actor_id
        order by a.created_at desc limit 50`
    )
    res.json({ activity: rows })
  })
)

/* ======================================================================
   CONTENT REVIEW — nothing goes live without passing through here
   ====================================================================== */

router.get(
  '/review',
  validateQuery(z.object({ status: z.enum(['pending_review', 'approved', 'rejected']).default('pending_review') })),
  asyncHandler(async (req, res) => {
    const rows = await many(
      `select v.*, coalesce(cp.display_name, p.full_name) as creator_name,
              p.avatar_url as creator_avatar, p.email as creator_email
         from videos v
         join profiles p on p.id = v.creator_id
         left join creator_profiles cp on cp.user_id = v.creator_id
        where v.review_status = $1 and v.deleted_at is null
        order by v.submitted_at asc nulls last, v.created_at asc`,
      [req.validatedQuery.status]
    )

    res.json({
      queue: rows.map((v) => ({
        ...studioVideo(v),
        creator: { id: v.creator_id, name: v.creator_name, email: v.creator_email, avatarUrl: v.creator_avatar },
      })),
    })
  })
)

const approveSchema = z.object({
  // The admin may change the Paid Premiere window before approving —
  // 30 / 60 / 90 or anything else, decided per video and per artist.
  premiereDays: z.coerce.number().int().min(1).max(3650).optional(),
  accessType: z.enum(['ppv_forever', 'paid_premiere', 'free_with_ads']).optional(),
  priceTzs: z.coerce.number().int().min(0).optional(),
  freePreviewSeconds: z.coerce.number().int().min(0).max(7200).optional(),
  note: z.string().trim().max(500).optional(),
})

/** Approve and publish. This is the only path that can set `is_published`. */
router.post(
  '/review/:id/approve',
  validate(approveSchema),
  asyncHandler(async (req, res) => {
    const video = await one('select * from videos where id = $1 and deleted_at is null', [req.params.id])
    if (!video) throw notFound('Video not found')
    if (video.review_status === 'approved') throw conflict('This video is already approved')

    const b = req.body
    const accessType = b.accessType ?? video.access_type
    if (accessType === 'paid_premiere' && !(b.premiereDays ?? video.premiere_days)) {
      throw badRequest('Set the Paid Premiere duration before approving')
    }

    const updated = await transaction(async (client) => {
      const { rows } = await client.query(
        `update videos set
           access_type          = coalesce($2, access_type),
           price_tzs            = case when coalesce($2, access_type) = 'free_with_ads'
                                       then 0 else coalesce($3, price_tzs) end,
           free_preview_seconds = coalesce($4, free_preview_seconds),
           premiere_days        = case when coalesce($2, access_type) = 'paid_premiere'
                                       then coalesce($5, premiere_days) else null end,
           ads_enabled          = (coalesce($2, access_type) = 'free_with_ads'),
           review_status        = 'approved',
           rejection_reason     = null,
           reviewed_by          = $6,
           reviewed_at          = now(),
           is_published         = true,
           published_at         = coalesce(published_at, now()),
           premiere_started_at  = case when coalesce($2, access_type) = 'paid_premiere'
                                       then coalesce(premiere_started_at, now()) else null end
         where id = $1 returning *`,
        [
          video.id,
          b.accessType ?? null,
          b.priceTzs ?? null,
          b.freePreviewSeconds ?? null,
          b.premiereDays ?? null,
          req.user.id,
        ]
      )
      return rows[0]
    }, asAdmin(req))

    // Cut the preview and promo clips now that it is live.
    ensureClips(video.id).catch(() => {})

    await recordStaffAction(req, {
      action: 'APPROVED',
      entityType: 'video',
      entityId: video.id,
      summary: `${who(req)} approved "${video.title}"`,
      detail: {
        title: video.title,
        accessType: updated.access_type,
        premiereDays: updated.premiere_days,
        priceTzs: updated.price_tzs,
        note: b.note || null,
      },
    })

    await notify({
      userId: video.creator_id,
      kind: 'account',
      title: `"${video.title}" is approved and live`,
      body: b.note || 'Your video passed review and is now visible to viewers.',
      actor: req.user,
      action: 'approve',
      entityType: 'video',
      entityId: video.id,
    })

    res.json({ video: studioVideo(updated), message: 'Approved and published' })
  })
)

router.post(
  '/review/:id/reject',
  validate(z.object({ reason: z.string().trim().min(5, 'Give the creator a reason').max(1000) })),
  asyncHandler(async (req, res) => {
    const video = await one('select * from videos where id = $1 and deleted_at is null', [req.params.id])
    if (!video) throw notFound('Video not found')

    const updated = await one(
      `update videos
          set review_status = 'rejected', rejection_reason = $2,
              reviewed_by = $3, reviewed_at = now(), is_published = false
        where id = $1 returning *`,
      [video.id, req.body.reason, req.user.id]
    )

    await recordStaffAction(req, {
      action: 'REJECTED',
      entityType: 'video',
      entityId: video.id,
      summary: `${who(req)} rejected "${video.title}"`,
      detail: { title: video.title, reason: req.body.reason },
    })

    // The creator needs to know, and needs to know why.
    await notify({
      userId: video.creator_id,
      kind: 'account',
      title: `"${video.title}" was not approved`,
      body: req.body.reason,
      actor: req.user,
      action: 'reject',
      entityType: 'video',
      entityId: video.id,
    })

    res.json({ video: studioVideo(updated), message: 'Rejected — the creator has been told why' })
  })
)

/* ======================================================================
   VIDEOS
   ====================================================================== */

router.get(
  '/videos',
  validateQuery(
    z.object({
      q: z.string().trim().max(120).optional(),
      status: anyOf(['published', 'unpublished', 'pending_review', 'rejected', 'deleted']),
      limit: z.coerce.number().int().min(1).max(100).default(50),
      offset: z.coerce.number().int().min(0).default(0),
    })
  ),
  asyncHandler(async (req, res) => {
    const { q, status, limit, offset } = req.validatedQuery
    const where = ['1=1']
    const params = []

    if (q) { params.push(`%${q}%`); where.push(`v.title ilike $${params.length}`) }
    if (status === 'published') where.push('v.is_published and v.deleted_at is null')
    else if (status === 'unpublished') where.push('not v.is_published and v.deleted_at is null')
    else if (status === 'deleted') where.push('v.deleted_at is not null')
    else if (status) { params.push(status); where.push(`v.review_status = $${params.length}`) }
    else where.push('v.deleted_at is null')

    params.push(limit, offset)
    const rows = await many(
      `select v.*, coalesce(cp.display_name, p.full_name) as creator_name,
              (select count(*)::int from purchases pu where pu.video_id = v.id and pu.status='active') as buyers
         from videos v
         join profiles p on p.id = v.creator_id
         left join creator_profiles cp on cp.user_id = v.creator_id
        where ${where.join(' and ')}
        order by v.created_at desc limit $${params.length - 1} offset $${params.length}`,
      params
    )

    res.json({
      videos: rows.map((v) => ({ ...studioVideo(v), creatorName: v.creator_name, buyers: v.buyers })),
    })
  })
)

/** Change a live video's terms — including the premiere window. */
router.patch(
  '/videos/:id',
  validate(
    z.object({
      accessType: z.enum(['ppv_forever', 'paid_premiere', 'free_with_ads']).optional(),
      priceTzs: z.coerce.number().int().min(0).optional(),
      freePreviewSeconds: z.coerce.number().int().min(0).max(7200).optional(),
      premiereDays: z.coerce.number().int().min(1).max(3650).optional(),
      adsEnabled: z.boolean().optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    const video = await one('select * from videos where id = $1', [req.params.id])
    if (!video) throw notFound('Video not found')
    const b = req.body

    const updated = await transaction(
      async (client) => {
        const { rows } = await client.query(
          `update videos set
             access_type          = coalesce($2, access_type),
             price_tzs            = case when coalesce($2, access_type) = 'free_with_ads'
                                         then 0 else coalesce($3, price_tzs) end,
             free_preview_seconds = coalesce($4, free_preview_seconds),
             premiere_days        = case when coalesce($2, access_type) = 'paid_premiere'
                                         then coalesce($5, premiere_days) else null end,
             ads_enabled          = coalesce($6, (coalesce($2, access_type) = 'free_with_ads'))
           where id = $1 returning *`,
          [
            video.id,
            b.accessType ?? null,
            b.priceTzs ?? null,
            b.freePreviewSeconds ?? null,
            b.premiereDays ?? null,
            b.adsEnabled ?? null,
          ]
        )
        return rows[0]
      },
      asAdmin(req)
    )

    await recordStaffAction(req, {
      action: 'CHANGED_VIDEO', entityType: 'video', entityId: video.id,
      summary: `${who(req)} edited "${video.title}"`, detail: b,
    })
    res.json({ video: studioVideo(updated) })
  })
)

/** Unpublish. Buyers keep everything they paid for. */
router.post(
  '/videos/:id/unpublish',
  asyncHandler(async (req, res) => {
    const updated = await transaction(
      async (client) => {
        const { rows } = await client.query(
          `update videos set is_published = false where id = $1 and deleted_at is null returning *`,
          [req.params.id]
        )
        if (!rows.length) throw notFound('Video not found')
        return rows[0]
      },
      asAdmin(req)
    )
    await recordStaffAction(req, {
      action: 'UNPUBLISHED', entityType: 'video', entityId: updated.id,
      summary: `${who(req)} unpublished "${updated.title}"`,
      detail: { title: updated.title },
    })
    await notify({
      userId: updated.creator_id, kind: 'account',
      title: `"${updated.title}" is no longer public`,
      body: 'Anyone who already bought it keeps their access.',
      actor: req.user, action: 'unpublish', entityType: 'video', entityId: updated.id,
    })
    res.json({ video: studioVideo(updated), message: 'Unpublished — buyers keep their access' })
  })
)

router.post(
  '/videos/:id/publish',
  asyncHandler(async (req, res) => {
    const video = await one('select * from videos where id = $1 and deleted_at is null', [req.params.id])
    if (!video) throw notFound('Video not found')
    if (video.review_status !== 'approved') throw badRequest('Approve the video before publishing it')

    const updated = await transaction(
      async (client) => {
        const { rows } = await client.query(
          `update videos set is_published = true, published_at = coalesce(published_at, now())
            where id = $1 returning *`,
          [video.id]
        )
        return rows[0]
      },
      asAdmin(req)
    )
    await recordStaffAction(req, {
      action: 'PUBLISHED', entityType: 'video', entityId: video.id,
      summary: `${who(req)} published "${video.title}"`,
    })
    await notify({
      userId: video.creator_id, kind: 'account',
      title: `"${video.title}" is live`,
      body: 'Your video is now visible to viewers.',
      actor: req.user, action: 'publish', entityType: 'video', entityId: video.id,
    })
    res.json({ video: studioVideo(updated) })
  })
)

/** Soft delete. The row and every entitlement survive, for audit. */
router.delete(
  '/videos/:id',
  asyncHandler(async (req, res) => {
    const video = await one('select * from videos where id = $1', [req.params.id])
    if (!video) throw notFound('Video not found')

    const buyers = await one(
      `select count(*)::int as n from purchases where video_id = $1 and status = 'active'`,
      [video.id]
    )

    const updated = await transaction(
      async (client) => {
        const { rows } = await client.query(
          `update videos set deleted_at = now(), deleted_by = $2, is_published = false
            where id = $1 returning *`,
          [video.id, req.user.id]
        )
        return rows[0]
      },
      asAdmin(req)
    )

    await recordStaffAction(req, {
      action: 'REMOVED_VIDEO', entityType: 'video', entityId: video.id,
      summary: `${who(req)} removed "${video.title}"`,
      body: buyers.n ? `${buyers.n} buyer(s) keep their access` : 'No purchases affected',
      detail: { title: video.title, buyers: buyers.n },
    })
    await notify({
      userId: video.creator_id, kind: 'account',
      title: `"${video.title}" was removed`,
      body: 'Contact support if you believe this was a mistake.',
      actor: req.user, action: 'delete', entityType: 'video', entityId: video.id,
    })

    res.json({
      video: studioVideo(updated),
      buyers: buyers.n,
      message:
        buyers.n > 0
          ? `Removed from the platform. ${buyers.n} buyer(s) keep their access record.`
          : 'Removed from the platform.',
    })
  })
)

/* ------------------------------------------------- creator delete requests */
router.get(
  '/deletion-requests',
  asyncHandler(async (_req, res) => {
    const rows = await many(
      `select r.*, v.title, v.thumbnail_url, v.slug,
              coalesce(cp.display_name, p.full_name) as creator_name,
              (select count(*)::int from purchases pu where pu.video_id = r.video_id and pu.status='active') as buyers
         from video_deletion_requests r
         join videos v on v.id = r.video_id
         join profiles p on p.id = r.requested_by
         left join creator_profiles cp on cp.user_id = r.requested_by
        where r.status = 'pending'
        order by r.created_at asc`
    )
    res.json({ requests: rows })
  })
)

router.post(
  '/deletion-requests/:id/decide',
  validate(
    z.object({
      decision: z.enum(['unpublish', 'approve', 'reject']),
      note: z.string().trim().max(500).optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    const request = await one('select * from video_deletion_requests where id = $1', [req.params.id])
    if (!request) throw notFound('Request not found')
    if (request.status !== 'pending') throw conflict('This request has already been decided')

    const { decision, note } = req.body
    const statusMap = { unpublish: 'unpublished', approve: 'approved', reject: 'rejected' }

    await transaction(
      async (client) => {
        await client.query(
          `update video_deletion_requests
              set status = $2, decided_by = $3, decided_at = now(), decision_note = $4
            where id = $1`,
          [request.id, statusMap[decision], req.user.id, note || null]
        )
        if (decision === 'unpublish') {
          await client.query('update videos set is_published = false where id = $1', [request.video_id])
        } else if (decision === 'approve') {
          await client.query(
            'update videos set deleted_at = now(), deleted_by = $2, is_published = false where id = $1',
            [request.video_id, req.user.id]
          )
        }
      },
      asAdmin(req)
    )

    await recordStaffAction(req, {
      action: `DELETION_${decision.toUpperCase()}`,
      entityType: 'video', entityId: request.video_id,
      summary: `${who(req)} ${decision === 'approve' ? 'approved' : 'declined'} a removal request`,
      detail: { note },
    })
    await notify({
      userId: request.creator_id, kind: 'account',
      title: decision === 'approve'
        ? 'Your removal request was approved'
        : 'Your removal request was declined',
      body: note || null,
      actor: req.user, action: 'deletion_request',
      entityType: 'video', entityId: request.video_id,
    })

    res.json({ ok: true, decision: statusMap[decision] })
  })
)

/* ======================================================================
   PEOPLE
   ====================================================================== */

router.get(
  '/users',
  requireAdmin(),
  validateQuery(
    z.object({
      q: z.string().trim().max(120).optional(),
      role: anyOf(['viewer', 'creator', 'admin', 'sub_admin']),
      status: anyOf(['active', 'blocked', 'suspended']),
      limit: z.coerce.number().int().min(1).max(100).default(50),
      offset: z.coerce.number().int().min(0).default(0),
    })
  ),
  asyncHandler(async (req, res) => {
    const { q, role, status, limit, offset } = req.validatedQuery
    const where = ['1=1']
    const params = []
    if (q) { params.push(`%${q}%`); where.push(`(p.full_name ilike $${params.length} or p.email ilike $${params.length} or p.phone ilike $${params.length})`) }
    if (role) { params.push(role); where.push(`p.role = $${params.length}`) }
    if (status) { params.push(status); where.push(`p.status = $${params.length}`) }

    params.push(limit, offset)
    const rows = await many(
      `select p.*,
              (select count(*)::int from purchases pu where pu.user_id = p.id and pu.status='active') as purchases,
              (select coalesce(sum(amount_tzs),0)::int from purchases pu where pu.user_id = p.id and pu.status='active') as spent
         from profiles p
        where ${where.join(' and ')}
        order by p.created_at desc limit $${params.length - 1} offset $${params.length}`,
      params
    )
    res.json({ users: rows })
  })
)

router.post(
  '/users/:id/status',
  requireAdmin(),
  validate(z.object({ status: z.enum(['active', 'blocked', 'suspended']), reason: z.string().max(500).optional() })),
  asyncHandler(async (req, res) => {
    if (req.params.id === req.user.id) throw badRequest('You cannot change your own status')
    const updated = await one(`update profiles set status = $2 where id = $1 returning *`, [
      req.params.id,
      req.body.status,
    ])
    if (!updated) throw notFound('User not found')

    await recordStaffAction(req, {
      action: req.body.status.toUpperCase(), entityType: 'profile', entityId: updated.id,
      summary: `${who(req)} set ${updated.full_name || updated.email} to ${req.body.status}`,
      body: req.body.reason || null,
      detail: { name: updated.full_name, reason: req.body.reason },
    })
    await notify({
      userId: updated.id, kind: 'account',
      title: req.body.status === 'active'
        ? 'Your account has been restored'
        : `Your account is now ${req.body.status}`,
      body: req.body.reason || null,
      actor: req.user, action: 'block', entityType: 'profile', entityId: updated.id,
    })
    res.json({ user: updated })
  })
)

router.get(
  '/creators',
  requireAdmin(),
  asyncHandler(async (_req, res) => {
    const rows = await many(
      `select p.id, p.full_name, p.email, p.avatar_url, p.status,
              cp.display_name, cp.location, cp.verified, cp.revenue_split_percent, cp.followers,
              (select count(*)::int from videos v where v.creator_id = p.id and v.deleted_at is null) as videos,
              (select coalesce(sum(creator_tzs),0)::int from earnings e where e.creator_id = p.id) as lifetime_tzs
         from profiles p join creator_profiles cp on cp.user_id = p.id
        order by lifetime_tzs desc`
    )
    res.json({ creators: rows })
  })
)

router.post(
  '/creators/:id/verify',
  requireAdmin(),
  validate(z.object({ verified: z.boolean().default(true) })),
  asyncHandler(async (req, res) => {
    const updated = await one(
      `update creator_profiles set verified = $2 where user_id = $1 returning *`,
      [req.params.id, req.body.verified]
    )
    if (!updated) throw notFound('Creator not found')
    await recordStaffAction(req, {
      action: req.body.verified ? 'VERIFIED' : 'UNVERIFIED',
      entityType: 'creator', entityId: req.params.id,
      summary: `${who(req)} ${req.body.verified ? 'verified' : 'un-verified'} a creator`,
    })
    await notify({
      userId: req.params.id, kind: 'account',
      title: req.body.verified ? 'You are now a verified creator' : 'Your verified badge was removed',
      actor: req.user, action: 'verify', entityType: 'creator', entityId: req.params.id,
    })
    res.json({ creator: updated })
  })
)

/** Per-creator split override; null puts them back on the platform default. */
router.post(
  '/creators/:id/split',
  requireAdmin(),
  validate(z.object({ splitPercent: z.coerce.number().int().min(0).max(100).nullable() })),
  asyncHandler(async (req, res) => {
    const updated = await one(
      `update creator_profiles set revenue_split_percent = $2 where user_id = $1 returning *`,
      [req.params.id, req.body.splitPercent]
    )
    if (!updated) throw notFound('Creator not found')
    await recordStaffAction(req, {
      action: 'CHANGED_SPLIT', entityType: 'creator', entityId: req.params.id,
      summary: `${who(req)} changed a creator revenue split`,
      detail: { splitPercent: req.body.splitPercent },
    })
    res.json({ creator: updated })
  })
)

/* ======================================================================
   MONEY
   ====================================================================== */

router.get(
  '/payments',
  validateQuery(
    z.object({
      status: anyOf(['pending', 'success', 'failed', 'cancelled', 'expired']),
      limit: z.coerce.number().int().min(1).max(200).default(100),
    })
  ),
  asyncHandler(async (req, res) => {
    const { status, limit } = req.validatedQuery
    const params = []
    let where = '1=1'
    if (status) { params.push(status); where = `pay.status = $1` }
    params.push(limit)

    const rows = await many(
      // The email as well as the name: chasing a specific payment by display
      // name is guesswork when two customers share one.
      `select pay.*, v.title as video_title, p.full_name as user_name, p.email as user_email,
              pu.creator_amount_tzs, pu.platform_amount_tzs, pu.split_percent
         from payments pay
         join videos v on v.id = pay.video_id
         join profiles p on p.id = pay.user_id
         left join purchases pu on pu.payment_id = pay.id
        where ${where}
        order by pay.created_at desc limit $${params.length}`,
      params
    )
    res.json({ payments: rows })
  })
)

router.get(
  '/withdrawals',
  asyncHandler(async (_req, res) => {
    const rows = await many(
      `select w.*, coalesce(cp.display_name, p.full_name) as creator_name, p.avatar_url,
              (select coalesce(sum(creator_tzs),0)::int from earnings e where e.creator_id = w.creator_id) as lifetime_tzs
         from withdrawals w
         join profiles p on p.id = w.creator_id
         left join creator_profiles cp on cp.user_id = w.creator_id
        order by (w.status = 'pending') desc, w.requested_at desc`
    )
    res.json({ withdrawals: rows })
  })
)

router.post(
  '/withdrawals/:id/decide',
  validate(z.object({ decision: z.enum(['paid', 'rejected']), note: z.string().max(500).optional() })),
  asyncHandler(async (req, res) => {
    const w = await one('select * from withdrawals where id = $1', [req.params.id])
    if (!w) throw notFound('Withdrawal not found')
    if (w.status !== 'pending') throw conflict('This withdrawal has already been decided')

    const updated = await one(
      `update withdrawals set status = $2, note = $3, decided_by = $4, decided_at = now()
        where id = $1 returning *`,
      [w.id, req.body.decision, req.body.note || null, req.user.id]
    )
    await recordStaffAction(req, {
      action: `WITHDRAWAL_${req.body.decision.toUpperCase()}`,
      entityType: 'withdrawal', entityId: w.id,
      summary: `${who(req)} ${req.body.decision}d a withdrawal of TZS ${Number(w.amount_tzs).toLocaleString()}`,
      detail: { amountTzs: w.amount_tzs },
    })
    await notify({
      userId: w.creator_id, kind: 'account',
      title: `Your withdrawal of TZS ${Number(w.amount_tzs).toLocaleString()} was ${req.body.decision}d`,
      actor: req.user, action: 'withdrawal', entityType: 'withdrawal', entityId: w.id,
    })
    res.json({ withdrawal: updated })
  })
)

router.get(
  '/revenue',
  asyncHandler(async (_req, res) => {
    const settings = await getSettings()
    const totals = await one(
      `select coalesce(sum(gross_tzs),0)::int as gross,
              coalesce(sum(creator_tzs),0)::int as creators,
              coalesce(sum(platform_tzs),0)::int as platform,
              coalesce(sum(case when source='ad' then platform_tzs else 0 end),0)::int as from_ads
         from earnings`
    )
    const overrides = await many(
      // The email comes along because display names are not unique. Two real
      // accounts shared the name "Waqas Naveed", and the overrides table showed
      // it twice with nothing to tell them apart — which reads as a duplicate
      // row rather than as two different people.
      `select p.id, coalesce(cp.display_name, p.full_name) as name, p.email,
              cp.revenue_split_percent
         from creator_profiles cp join profiles p on p.id = cp.user_id
        order by (cp.revenue_split_percent is null), name`
    )
    const monthly = await many(
      `select date_trunc('month', created_at)::date as month,
              coalesce(sum(gross_tzs),0)::int as gross,
              coalesce(sum(platform_tzs),0)::int as platform
         from earnings where created_at > now() - interval '12 months'
        group by 1 order by 1`
    )
    res.json({ defaultSplitPercent: settings.creator_split_percent, totals, overrides, monthly })
  })
)

/* ======================================================================
   SETTINGS · JOBS · AUDIT
   ====================================================================== */

router.get('/settings', asyncHandler(async (_req, res) => res.json({ settings: await getSettings({ fresh: true }) })))

router.patch(
  '/settings',
  requireAdmin(),
  validate(
    z.object({
      creator_split_percent: z.coerce.number().int().min(0).max(100).optional(),
      min_video_price_tzs: z.coerce.number().int().min(0).optional(),
      min_withdrawal_tzs: z.coerce.number().int().min(0).optional(),
      default_preview_seconds: z.coerce.number().int().min(0).max(7200).optional(),
      default_premiere_days: z.coerce.number().int().min(1).max(3650).optional(),
      registrations_open: z.boolean().optional(),
      require_creator_approval: z.boolean().optional(),
      auto_premiere_to_free: z.boolean().optional(),
      maintenance_mode: z.boolean().optional(),
      preroll_enabled: z.boolean().optional(),
      preroll_skip_after_secs: z.coerce.number().int().min(0).max(60).optional(),
      ads_on_expired_premieres: z.boolean().optional(),
      share_ad_revenue: z.boolean().optional(),
      midroll_enabled: z.boolean().optional(),
      /* A mid-roll needs a middle: anything under a minute has none. */
      midroll_after_secs: z.coerce.number().int().min(60).max(7200).optional(),
      postroll_enabled: z.boolean().optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    const settings = await updateSettings(req.body)
    await recordStaffAction(req, {
      action: 'CHANGED_SETTINGS', entityType: 'settings', entityId: '1',
      summary: `${who(req)} changed the platform settings`,
      detail: req.body,
    })
    res.json({ settings })
  })
)

router.get(
  '/audit',
  validateQuery(z.object({ q: z.string().max(120).optional(), limit: z.coerce.number().int().min(1).max(200).default(100) })),
  asyncHandler(async (req, res) => {
    const { q, limit } = req.validatedQuery
    const params = []
    let where = '1=1'
    if (q) { params.push(`%${q}%`); where = `(a.action ilike $1 or a.entity_type ilike $1 or p.full_name ilike $1)` }
    params.push(limit)
    const rows = await many(
      `select a.*, p.full_name as actor_name, p.email as actor_email
         from audit_log a left join profiles p on p.id = a.actor_id
        where ${where} order by a.created_at desc limit $${params.length}`,
      params
    )
    res.json({ entries: rows })
  })
)

/** Run the premiere-expiry sweep on demand, for testing. */
router.post(
  '/jobs/premiere-expiry',
  asyncHandler(async (req, res) => {
    const result = await runPremiereExpiry({ actorId: req.user.id })
    res.json(result)
  })
)

/* ======================================================================
   ADVERTISING

   A campaign is only worth anything once it can actually be served, so every
   field the selection logic reads is editable here: the advert itself, the
   window it runs in, the placements it may take, and who it may run against.
   Performance comes from the impressions rather than from a stored counter, so
   the figures cannot drift away from what was delivered.
   ====================================================================== */

/**
 * Campaign columns, with the placement list cast to text.
 *
 * `placements` is an array of a custom enum, and node-postgres has no parser for
 * those — it hands back the raw literal `{pre_roll,mid_roll}` as a string. The
 * admin then called `.map` on a string and the whole Ads screen went blank.
 * Casting to `text[]` gives it an array, which is what it always looked like.
 */
const CAMPAIGN_COLS = `
  id, name, advertiser, active, cpm_tzs, created_at, cloudflare_uid,
  duration_seconds, thumbnail_url, starts_at, ends_at,
  placements::text[] as placements,
  target_video_ids, target_categories, target_creator_ids,
  skip_after_seconds, notes, created_by, updated_at`

/** Shape a campaign row plus its measured performance for the admin UI. */
const campaignOut = (c, perf) => ({
  id: c.id,
  name: c.name,
  advertiser: c.advertiser,
  active: c.active,
  cpmTzs: c.cpm_tzs,
  cloudflareUid: c.cloudflare_uid,
  durationSeconds: c.duration_seconds,
  hasVideo: Boolean(c.cloudflare_uid),
  startsAt: c.starts_at,
  endsAt: c.ends_at,
  placements: c.placements || [],
  targetVideoIds: c.target_video_ids || [],
  targetCategories: c.target_categories || [],
  targetCreatorIds: c.target_creator_ids || [],
  skipAfterSeconds: c.skip_after_seconds,
  notes: c.notes,
  createdAt: c.created_at,
  updatedAt: c.updated_at,
  /** Live now, or why not — the question every campaign list is really asked. */
  status: !c.active
    ? 'paused'
    : !c.cloudflare_uid
      ? 'no video'
      : c.starts_at && new Date(c.starts_at) > new Date()
        ? 'scheduled'
        : c.ends_at && new Date(c.ends_at) < new Date()
          ? 'ended'
          : 'live',
  performance: perf || {
    impressions: 0, completed: 0, videos: 0,
    revenueTzs: 0, creatorTzs: 0, platformTzs: 0, lastServedAt: null,
  },
})

router.get(
  '/ads',
  asyncHandler(async (_req, res) => {
    const [rows, perf, stats, categories] = await Promise.all([
      many(`select ${CAMPAIGN_COLS} from ad_campaigns order by created_at desc`),
      campaignPerformance(),
      one(
        `select count(*)::int                                          as impressions,
                count(*) filter (where completed)::int                  as completed,
                coalesce(sum(revenue_micro_tzs),0)::bigint              as revenue_micro,
                coalesce(sum(creator_micro_tzs),0)::bigint              as creator_micro,
                coalesce(sum(platform_micro_tzs),0)::bigint             as platform_micro,
                (select count(*)::int from videos
                  where ads_enabled and is_published and access_type = 'free_with_ads'
                    and deleted_at is null)                             as videos_with_ads
           from ad_impressions where created_at > now() - interval '30 days'`
      ),
      many(
        `select distinct category from videos
          where category is not null and category <> '' and deleted_at is null
          order by category`
      ),
    ])

    res.json({
      campaigns: rows.map((c) => campaignOut(c, perf.get(c.id))),
      stats: {
        impressions: stats.impressions,
        completed: stats.completed,
        revenueTzs: microToTzs(stats.revenue_micro),
        creatorTzs: microToTzs(stats.creator_micro),
        platformTzs: microToTzs(stats.platform_micro),
        videosWithAds: stats.videos_with_ads,
      },
      /* So the targeting controls can offer real choices instead of free text. */
      options: { categories: categories.map((r) => r.category) },
    })
  })
)

const PLACEMENTS = ['pre_roll', 'mid_roll', 'post_roll']

const campaignSchema = z.object({
  name: z.string().trim().min(2).max(120),
  advertiser: z.string().trim().max(120).optional(),
  cpmTzs: z.coerce.number().int().min(0).max(10_000_000).default(0),
  active: z.boolean().default(true),
  startsAt: z.string().datetime().nullish(),
  endsAt: z.string().datetime().nullish(),
  placements: z.array(z.enum(PLACEMENTS)).min(1).default(['pre_roll']),
  targetVideoIds: z.array(z.string().uuid()).max(500).default([]),
  targetCategories: z.array(z.string().trim().min(1).max(60)).max(60).default([]),
  targetCreatorIds: z.array(z.string().uuid()).max(500).default([]),
  skipAfterSeconds: z.coerce.number().int().min(0).max(120).default(5),
  notes: z.string().trim().max(1000).optional(),
})

/** A window that ends before it starts would simply never run. */
const checkWindow = (startsAt, endsAt) => {
  if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
    throw badRequest('The campaign end date must come after its start date')
  }
}

router.post(
  '/ads',
  validate(campaignSchema),
  asyncHandler(async (req, res) => {
    const b = req.body
    checkWindow(b.startsAt, b.endsAt)

    const c = await one(
      `insert into ad_campaigns
         (name, advertiser, cpm_tzs, active, starts_at, ends_at, placements,
          target_video_ids, target_categories, target_creator_ids,
          skip_after_seconds, notes, created_by)
       values ($1,$2,$3,$4,$5,$6,$7::ad_placement[],$8::uuid[],$9::text[],$10::uuid[],$11,$12,$13)
       returning ${CAMPAIGN_COLS}`,
      [
        b.name, b.advertiser || null, b.cpmTzs, b.active,
        b.startsAt || null, b.endsAt || null, b.placements,
        b.targetVideoIds, b.targetCategories, b.targetCreatorIds,
        b.skipAfterSeconds, b.notes || null, req.user.id,
      ]
    )

    await recordStaffAction(req, {
      action: 'CREATED_CAMPAIGN', entityType: 'ad_campaign', entityId: c.id,
      summary: `${who(req)} created the ad campaign "${c.name}"`,
      detail: { name: c.name, advertiser: c.advertiser, cpmTzs: c.cpm_tzs, placements: c.placements },
    })
    res.status(201).json({ campaign: campaignOut(c) })
  })
)

router.patch(
  '/ads/:id',
  validate(campaignSchema.partial()),
  asyncHandler(async (req, res) => {
    const existing = await one('select * from ad_campaigns where id = $1', [req.params.id])
    if (!existing) throw notFound('Campaign not found')

    const b = req.body
    checkWindow(
      b.startsAt === undefined ? existing.starts_at : b.startsAt,
      b.endsAt === undefined ? existing.ends_at : b.endsAt
    )

    const c = await one(
      `update ad_campaigns set
         name               = coalesce($2, name),
         advertiser         = coalesce($3, advertiser),
         cpm_tzs            = coalesce($4, cpm_tzs),
         active             = coalesce($5, active),
         starts_at          = coalesce($6, starts_at),
         ends_at            = coalesce($7, ends_at),
         placements         = coalesce($8::ad_placement[], placements),
         target_video_ids   = coalesce($9::uuid[], target_video_ids),
         target_categories  = coalesce($10::text[], target_categories),
         target_creator_ids = coalesce($11::uuid[], target_creator_ids),
         skip_after_seconds = coalesce($12, skip_after_seconds),
         notes              = coalesce($13, notes),
         updated_at         = now()
       where id = $1 returning ${CAMPAIGN_COLS}`,
      [
        req.params.id,
        b.name ?? null, b.advertiser ?? null, b.cpmTzs ?? null, b.active ?? null,
        b.startsAt ?? null, b.endsAt ?? null, b.placements ?? null,
        b.targetVideoIds ?? null, b.targetCategories ?? null, b.targetCreatorIds ?? null,
        b.skipAfterSeconds ?? null, b.notes ?? null,
      ]
    )

    const perf = await campaignPerformance(c.id)
    await recordStaffAction(req, {
      action: 'UPDATED_CAMPAIGN', entityType: 'ad_campaign', entityId: c.id,
      summary:
        b.active === false
          ? `${who(req)} paused the ad campaign "${c.name}"`
          : b.active === true
            ? `${who(req)} resumed the ad campaign "${c.name}"`
            : `${who(req)} edited the ad campaign "${c.name}"`,
      detail: { changed: Object.keys(b) },
    })
    res.json({ campaign: campaignOut(c, perf.get(c.id)) })
  })
)

/**
 * Somewhere to upload the advert to.
 *
 * The browser sends the file straight to Cloudflare, exactly as a creator's
 * upload does — the video never passes through this server.
 */
router.post(
  '/ads/:id/upload',
  asyncHandler(async (req, res) => {
    const c = await one('select * from ad_campaigns where id = $1', [req.params.id])
    if (!c) throw notFound('Campaign not found')
    if (!capabilities.cloudflareStream) throw badRequest('Cloudflare Stream is not configured')

    const upload = await cfCreateDirectUpload({
      name: `AD · ${c.name}`,
      maxDurationSeconds: 600,
      meta: { kind: 'advert', campaignId: c.id },
    })

    await query('update ad_campaigns set cloudflare_uid = $2, updated_at = now() where id = $1', [
      c.id,
      upload.uid,
    ])

    // `createDirectUpload` returns `uploadUrl`; reading Cloudflare's raw
    // `uploadURL` here handed the browser `undefined` to upload to.
    res.status(201).json({ uploadUrl: upload.uploadUrl, uid: upload.uid })
  })
)

/**
 * Has the advert finished encoding?
 *
 * Cloudflare only knows a video's duration once it has processed it, and the
 * duration is what the player uses to decide when the skip button appears.
 */
router.get(
  '/ads/:id/media',
  asyncHandler(async (req, res) => {
    const c = await one('select * from ad_campaigns where id = $1', [req.params.id])
    if (!c) throw notFound('Campaign not found')
    if (!c.cloudflare_uid) return res.json({ state: 'none' })

    const details = await cfVideoDetails(c.cloudflare_uid).catch(() => null)
    const ready = details?.readyToStream === true
    const seconds = Math.round(Number(details?.duration || 0))

    if (ready && seconds > 0 && seconds !== c.duration_seconds) {
      await query('update ad_campaigns set duration_seconds = $2, updated_at = now() where id = $1', [
        c.id,
        seconds,
      ])
    }

    res.json({
      state: ready ? 'ready' : details ? 'processing' : 'unknown',
      durationSeconds: seconds || c.duration_seconds || 0,
      uid: c.cloudflare_uid,
    })
  })
)

/**
 * Delete a campaign.
 *
 * Its impressions are kept — they are the evidence behind money already paid to
 * creators, and deleting them would restate earnings that have been reported.
 */
router.delete(
  '/ads/:id',
  requireAdmin(),
  asyncHandler(async (req, res) => {
    const c = await one('select * from ad_campaigns where id = $1', [req.params.id])
    if (!c) throw notFound('Campaign not found')

    await query('delete from ad_campaigns where id = $1', [c.id])
    await recordStaffAction(req, {
      action: 'DELETED_CAMPAIGN', entityType: 'ad_campaign', entityId: c.id,
      summary: `${who(req)} deleted the ad campaign "${c.name}"`,
      detail: { name: c.name },
    })
    res.json({ deleted: true })
  })
)

export default router
