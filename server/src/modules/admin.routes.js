import { Router } from 'express'
import { z } from 'zod'
import { one, many, query, transaction } from '../db/pool.js'
import { asyncHandler, badRequest, conflict, notFound } from '../lib/errors.js'
import { validate, validateQuery } from '../middleware/validate.js'
import { requireAuth, requireStaff, requireAdmin, requirePermission } from '../middleware/auth.js'
import { getSettings, updateSettings, invalidateSettingsCache, applySplit, splitPercentFor } from '../services/settings.js'
import { invalidateProfileCache } from '../lib/profileCache.js'
import { recordAudit, recordStaffAction, clientIp } from '../services/audit.js'
import { notify, notifyMany } from '../services/notify.js'
import { studioVideo, thumbnailFor } from '../services/entitlement.js'
import { runPremiereExpiry } from '../jobs/premiere.js'
import { ensureClips } from './playback.routes.js'
import { campaignPerformance, microToTzs } from '../services/ads.js'
import { createDirectUpload as cfCreateDirectUpload, getVideo as cfVideoDetails } from '../lib/cloudflare.js'
import { verifyMail, sendMail, passwordChangedEmail } from '../lib/mailer.js'
import { capabilities, env } from '../config/env.js'
import { clampFreePreviewSeconds, clampPreviewSql } from '../lib/preview.js'
import { buildShareCard } from '../lib/buildShareCard.js'
import { log } from '../lib/logger.js'
import { shapeApplication } from '../lib/creatorApplication.js'

const router = Router()

/**
 * Staff — admin or sub-admin — may run the platform: review content, decide
 * withdrawals, manage ads. Anything to do with *accounts* carries its own
 * requireAdmin() below, because a sub-admin must not see or change them.
 */
router.use(requireAuth(), requireStaff())

/**
 * Per-module permissions, applied by path prefix.
 *
 * "sub_admin" was a single switch — in, or not in — which let somebody brought
 * on to review uploads also decide withdrawals and change the revenue split.
 * Each area now asks the narrower question, and mounting the check on the
 * prefix means a route added under one of these paths later is covered by
 * default rather than by somebody remembering.
 *
 * An administrator passes every one of these; their role is the permission.
 * The routes that were already `requireAdmin()` keep it — this is an additional
 * gate, never a replacement for one.
 *
 * `/overview` and `/activity` are deliberately not listed: they are the landing
 * screen, they expose counts rather than records, and a staff member with no
 * modules at all should still be able to see that the queue exists.
 */
router.use('/review', requirePermission('review'))
router.use('/videos', requirePermission('videos'))
router.use('/reports', requirePermission('moderation'))
router.use('/deletion-requests', requirePermission('moderation'))
router.use('/users', requirePermission('users'))
router.use('/creators', requirePermission('creators'))
router.use('/creator-applications', requirePermission('creators'))
router.use('/payments', requirePermission('payments'))
router.use('/withdrawals', requirePermission('withdrawals'))
router.use('/revenue', requirePermission('revenue'))
router.use('/ads', requirePermission('ads'))
router.use('/audit', requirePermission('audit'))

/**
 * `/settings` is deliberately NOT gated as a whole.
 *
 * Reading platform configuration is not a privilege — the Ads screen needs to
 * know whether pre-roll is switched on, Creators needs the default split, and
 * gating the read would break screens whose own permission the person already
 * holds. Changing it is the sensitive half, and PATCH keeps its requireAdmin()
 * below. The `settings` module governs the Settings screen itself.
 */

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
                  (select count(*)::int from video_deletion_requests where status = 'pending') as deletions,
                  (select count(*)::int from content_reports where status = 'open') as reports,
                  (select count(*)::int from creator_applications where status = 'pending') as applications
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
        openReports: pending.reports,
        pendingApplications: pending.applications,
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
  validateQuery(
    z.object({
      status: z
        .enum(['pending_review', 'approved', 'rejected', 'changes_requested'])
        .default('pending_review'),
    })
  ),
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

/**
 * Approval carries a note, and nothing else.
 *
 * It used to accept accessType, priceTzs, freePreviewSeconds and premiereDays,
 * and wrote them straight over whatever the creator had chosen — without ever
 * telling them. The client's instruction was explicit: "Admin may Approve,
 * Reject or Request Changes, but should not silently alter commercial
 * settings. Our principle is 'Your Content. Your Rules.'"
 *
 * A reviewer who thinks the terms are wrong now says so with Request Changes,
 * and the creator makes the change themselves. Nobody's price is ever quietly
 * rewritten by someone the viewer is not buying from.
 */
const approveSchema = z.object({
  note: z.string().trim().max(500).optional(),
})

/** Approve and publish, on the creator's own terms. */
router.post(
  '/review/:id/approve',
  validate(approveSchema),
  asyncHandler(async (req, res) => {
    const video = await one('select * from videos where id = $1 and deleted_at is null', [req.params.id])
    if (!video) throw notFound('Video not found')
    if (video.review_status === 'approved') throw conflict('This video is already approved')

    /**
     * A Paid Premiere with no window cannot go live — there would be nothing to
     * expire, and it would sit paid forever. Ask the creator for one rather than
     * inventing a number on their behalf.
     */
    if (video.access_type === 'paid_premiere' && !video.premiere_days) {
      throw badRequest(
        'This Paid Premiere has no paid period set. Use "Request changes" and ask the creator to choose one.'
      )
    }

    if (!video.preview_uid) {
      await ensureClips(video.id).catch(() => {})
    }

    const updated = await transaction(async (client) => {
      const { rows } = await client.query(
        `update videos set
           ads_enabled          = (access_type = 'free_with_ads'),
           review_status        = 'approved',
           rejection_reason     = null,
           reviewed_by          = $2,
           reviewed_at          = now(),
           is_published         = true,
           published_at         = coalesce(published_at, now()),
           premiere_started_at  = case when access_type = 'paid_premiere'
                                       then coalesce(premiere_started_at, now()) else null end,
           free_preview_seconds = ${clampPreviewSql('duration_seconds')}
         where id = $1 returning *`,
        [video.id, req.user.id]
      )
      return rows[0]
    }, asAdmin(req))

    ensureClips(video.id).catch(() => {})
    try {
      await buildShareCard(updated.id)
    } catch (err) {
      log.error(`share card build on approve slug=${updated.slug}:`, err.message)
    }

    await recordStaffAction(req, {
      action: 'APPROVED',
      entityType: 'video',
      entityId: video.id,
      summary: `${who(req)} approved "${video.title}"`,
      detail: {
        title: video.title,
        // Recorded so the log shows the terms it went live on — these are the
        // creator's, unchanged.
        accessType: updated.access_type,
        premiereDays: updated.premiere_days,
        priceTzs: updated.price_tzs,
        note: req.body.note || null,
      },
    })

    await notify({
      userId: video.creator_id,
      kind: 'account',
      title: `"${video.title}" is approved and live`,
      body: req.body.note || 'Your video passed review and is now visible to viewers.',
      actor: req.user,
      action: 'approve',
      entityType: 'video',
      entityId: video.id,
    })

    res.json({ video: studioVideo(updated), message: 'Approved and published' })
  })
)

/**
 * Ask for a correction, without throwing the submission away.
 *
 * Between "this is fine" and "this is not publishable" sits the ordinary case:
 * one thing needs fixing. Until now a reviewer had only Reject, which reads to
 * a creator as "start again" and discards work that was nearly right — and it
 * was the only way to influence terms the reviewer disagreed with, which is how
 * silently editing someone's price came to feel reasonable.
 *
 * The video stays where it is, the note travels with it, and the creator edits
 * and resubmits the same video. `changes_requested` is not `pending_review`, so
 * it leaves the queue and stops being counted as waiting on staff.
 */
router.post(
  '/review/:id/request-changes',
  validate(
    z.object({
      note: z.string().trim().min(5, 'Tell the creator what to change').max(1000),
    })
  ),
  asyncHandler(async (req, res) => {
    const video = await one('select * from videos where id = $1 and deleted_at is null', [req.params.id])
    if (!video) throw notFound('Video not found')
    if (video.review_status === 'approved') {
      throw conflict('This video is already live. Unpublish it first if it needs changing.')
    }

    const updated = await one(
      `update videos
          set review_status = 'changes_requested',
              rejection_reason = $2,
              reviewed_by = $3,
              reviewed_at = now(),
              is_published = false
        where id = $1 returning *`,
      [video.id, req.body.note, req.user.id]
    )

    await recordStaffAction(req, {
      action: 'CHANGES_REQUESTED',
      entityType: 'video',
      entityId: video.id,
      summary: `${who(req)} asked for changes to "${video.title}"`,
      detail: { title: video.title, note: req.body.note },
    })

    await notify({
      userId: video.creator_id,
      kind: 'account',
      title: `"${video.title}" needs a small change`,
      body: req.body.note,
      actor: req.user,
      action: 'request_changes',
      entityType: 'video',
      entityId: video.id,
    })

    res.json({
      video: studioVideo(updated),
      message: 'Sent back to the creator with your note',
    })
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
      status: anyOf([
        'published',
        'unpublished',
        'pending_review',
        'changes_requested',
        'rejected',
        'deleted',
        'featured',
      ]),
      category: z.string().trim().max(60).optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50),
      offset: z.coerce.number().int().min(0).default(0),
    })
  ),
  asyncHandler(async (req, res) => {
    const { q, status, category, limit, offset } = req.validatedQuery
    const where = ['1=1']
    const params = []

    if (q) { params.push(`%${q}%`); where.push(`v.title ilike $${params.length}`) }
    if (category) { params.push(category); where.push(`v.category = $${params.length}`) }
    if (status === 'published') where.push('v.is_published and v.deleted_at is null')
    else if (status === 'unpublished') where.push('not v.is_published and v.deleted_at is null')
    else if (status === 'deleted') where.push('v.deleted_at is not null')
    else if (status === 'featured') where.push('v.featured and v.deleted_at is null')
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
      /* The front-page choice. Deliberately not tied to publication. */
      featured: z.boolean().optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    const video = await one('select * from videos where id = $1', [req.params.id])
    if (!video) throw notFound('Video not found')
    const b = req.body
    const previewSeconds =
      b.freePreviewSeconds == null
        ? null
        : clampFreePreviewSeconds(b.freePreviewSeconds, video.duration_seconds)

    const updated = await transaction(
      async (client) => {
        const { rows } = await client.query(
          `update videos set
             access_type          = coalesce($2, access_type),
             price_tzs            = case when coalesce($2, access_type) = 'free_with_ads'
                                         then 0 else coalesce($3, price_tzs) end,
             free_preview_seconds = coalesce($4, free_preview_seconds),
             preview_uid          = case
               when $4 is not null and $4 is distinct from free_preview_seconds then null
               else preview_uid
             end,
             premiere_days        = case when coalesce($2, access_type) = 'paid_premiere'
                                         then coalesce($5, premiere_days) else null end,
             ads_enabled          = coalesce($6, (coalesce($2, access_type) = 'free_with_ads')),
             featured             = coalesce($7, featured)
           where id = $1 returning *`,
          [
            video.id,
            b.accessType ?? null,
            b.priceTzs ?? null,
            previewSeconds,
            b.premiereDays ?? null,
            b.adsEnabled ?? null,
            b.featured ?? null,
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
    const buyers = await many(
      `select user_id from purchases where video_id = $1 and status = 'active'`,
      [updated.id]
    )
    await notifyMany(
      buyers.map((b) => b.user_id),
      {
        kind: 'account',
        title: `"${updated.title}" is no longer listed publicly`,
        body: 'You already paid — it stays in your library.',
        actor: req.user,
        action: 'unpublish',
        entityType: 'video',
        entityId: updated.id,
      }
    )
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
    try {
      await buildShareCard(updated.id)
    } catch (err) {
      log.error(`share card build on publish slug=${updated.slug}:`, err.message)
    }
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

/* ======================================================================
   CONTENT REPORTS — what viewers have flagged
   ====================================================================== */

router.get(
  '/reports',
  validateQuery(
    z.object({
      status: anyOf(['open', 'upheld', 'dismissed']),
      limit: z.coerce.number().int().min(1).max(100).default(50),
      offset: z.coerce.number().int().min(0).default(0),
    })
  ),
  asyncHandler(async (req, res) => {
    const { status, limit, offset } = req.validatedQuery
    const where = ['1=1']
    const params = []
    if (status) { params.push(status); where.push(`r.status = $${params.length}::report_status`) }

    params.push(limit, offset)
    const rows = await many(
      `select r.*, v.title, v.slug, v.is_published, v.review_status,
              coalesce(cp.display_name, p.full_name) as creator_name,
              reporter.full_name as reporter_name
         from content_reports r
         join videos v   on v.id = r.video_id
         join profiles p on p.id = v.creator_id
         left join creator_profiles cp on cp.user_id = v.creator_id
         left join profiles reporter on reporter.id = r.reporter_id
        where ${where.join(' and ')}
        order by (r.status = 'open') desc, r.created_at desc
        limit $${params.length - 1} offset $${params.length}`,
      params
    )
    const total = await one(
      `select count(*)::int as n from content_reports r where ${where.join(' and ')}`,
      params.slice(0, params.length - 2)
    )
    res.json({ reports: rows, total: total?.n ?? 0, limit, offset })
  })
)

/**
 * Decide a report.
 *
 * Upholding one can take the video down in the same action, because leaving
 * infringing material up while somebody remembers to go and unpublish it is the
 * gap the report was raised to close. Dismissing records why, so a second
 * report about the same thing is not started from nothing.
 */
router.post(
  '/reports/:id/decide',
  validate(
    z.object({
      decision: z.enum(['uphold', 'dismiss']),
      unpublish: z.boolean().default(false),
      note: z.string().trim().max(600).optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    const report = await one('select * from content_reports where id = $1', [req.params.id])
    if (!report) throw notFound('Report not found')
    if (report.status !== 'open') throw conflict('This report has already been decided')

    const { decision, unpublish, note } = req.body
    const video = await one('select * from videos where id = $1', [report.video_id])

    await transaction(async (client) => {
      await client.query(
        `update content_reports
            set status = $2::report_status, decided_by = $3, decided_at = now(), decision_note = $4
          where id = $1`,
        [report.id, decision === 'uphold' ? 'upheld' : 'dismissed', req.user.id, note || null]
      )
      if (decision === 'uphold' && unpublish && video?.is_published) {
        await client.query('update videos set is_published = false where id = $1', [video.id])
      }
    }, asAdmin(req))

    await recordStaffAction(req, {
      action: decision === 'uphold' ? 'REPORT_UPHELD' : 'REPORT_DISMISSED',
      entityType: 'video',
      entityId: report.video_id,
      summary: `${who(req)} ${decision === 'uphold' ? 'upheld' : 'dismissed'} a report on "${video?.title ?? 'a video'}"`,
      body: note || null,
      detail: { reason: report.reason, unpublished: decision === 'uphold' && unpublish },
    })

    if (decision === 'uphold' && unpublish && video) {
      await notify({
        userId: video.creator_id,
        kind: 'account',
        title: `"${video.title}" was taken down after a report`,
        body: note || 'Contact support if you believe this was a mistake.',
        actor: req.user,
        action: 'report',
        entityType: 'video',
        entityId: video.id,
      })
    }

    res.json({ ok: true, decision })
  })
)

/* ------------------------------------------------- creator delete requests */
router.get(
  '/deletion-requests',
  asyncHandler(async (_req, res) => {
    const rows = await many(
      // An unpublished video's poster still needs a key in the URL, and a
      // removal request is exactly the case where the video may not be public.
      `select r.*, v.title, v.slug,
              v.id as video_id, v.thumbnail_url, v.custom_thumbnail_url,
              v.cloudflare_uid, v.preview_uid, v.access_type,
              v.is_published, v.review_status, v.deleted_at,
              coalesce(cp.display_name, p.full_name) as creator_name,
              (select count(*)::int from purchases pu where pu.video_id = r.video_id and pu.status='active') as buyers
         from video_deletion_requests r
         join videos v on v.id = r.video_id
         join profiles p on p.id = r.requested_by
         left join creator_profiles cp on cp.user_id = r.requested_by
        where r.status = 'pending'
        order by r.created_at asc`
    )
    /* `r.*` carries the REQUEST's id, so the video's has to be handed over
       explicitly — otherwise the poster is addressed by the wrong record. */
    res.json({
      requests: rows.map((r) => ({
        ...r,
        thumbnailUrl: thumbnailFor({ ...r, id: r.video_id }),
      })),
    })
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
    invalidateProfileCache(updated.id)

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
      status: anyOf(['pending', 'success', 'failed', 'cancelled', 'expired', 'refunded']),
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

/**
 * Refund a sale.
 *
 * The client asked for Refunded alongside the other four payment states, and it
 * was the only one with nowhere to come from: the status existed, nothing could
 * set it, and an administrator who had actually returned somebody's money had no
 * way to say so.
 *
 * Three things move together or none of them do. The payment is marked
 * refunded; the entitlement stops being active, which is what actually closes
 * access, because `resolveAccess` only ever counts an active purchase; and the
 * creator's credit is reversed, because otherwise they could withdraw against a
 * sale that no longer exists.
 *
 * The reversal is a negative ledger entry rather than a deleted one. Money that
 * moved and then moved back is two facts, and a ledger that quietly loses the
 * first cannot be reconciled against the payments it came from.
 *
 * This does NOT move money. Mobile money refunds are made by hand in the
 * provider's own portal; this records that it happened and takes the access back.
 */
router.post(
  '/payments/:id/refund',
  requireAdmin(),
  validate(z.object({ reason: z.string().trim().max(500).optional() })),
  asyncHandler(async (req, res) => {
    const payment = await one('select * from payments where id = $1', [req.params.id])
    if (!payment) throw notFound('Payment not found')
    if (payment.status === 'refunded') throw conflict('This payment has already been refunded')
    if (payment.status !== 'success') {
      throw badRequest(`Only a successful payment can be refunded — this one is ${payment.status}`)
    }

    const reason = req.body.reason || 'Refunded by an administrator'

    const outcome = await transaction(async (client) => {
      await client.query(
        `update payments set status = 'refunded', failure_reason = $2, updated_at = now()
          where id = $1`,
        [payment.id, reason]
      )

      const { rows: reversed } = await client.query(
        `update purchases set status = 'refunded'
          where payment_id = $1 and status = 'active'
        returning id, creator_amount_tzs, platform_amount_tzs, amount_tzs, split_percent, video_id`,
        [payment.id]
      )

      const video = await client.query('select creator_id from videos where id = $1', [payment.video_id])
      const creatorId = video.rows[0]?.creator_id

      for (const p of reversed) {
        if (!creatorId) continue
        await client.query(
          `insert into earnings
             (creator_id, video_id, purchase_id, source, gross_tzs, creator_tzs, platform_tzs, split_percent)
           values ($1,$2,$3,'sale',$4,$5,$6,$7)`,
          [
            creatorId,
            p.video_id,
            p.id,
            -p.amount_tzs,
            -p.creator_amount_tzs,
            -p.platform_amount_tzs,
            p.split_percent,
          ]
        )
      }

      // `videos.paid_unlocks` needs no help — the trigger from migration 006
      // recounts active purchases, and this one has stopped being active.
      return { reversed: reversed.length }
    }, asAdmin(req))

    await recordStaffAction(req, {
      action: 'REFUNDED_PAYMENT',
      entityType: 'payment',
      entityId: payment.id,
      summary: `${who(req)} refunded TZS ${Number(payment.amount_tzs).toLocaleString()}`,
      body: reason,
      detail: { amountTzs: payment.amount_tzs, videoId: payment.video_id, reason },
    })

    await notify({
      userId: payment.user_id,
      kind: 'account',
      title: 'Your payment has been refunded',
      body: `${reason} Access to that video has been removed.`,
      actor: req.user,
      action: 'refund',
      entityType: 'payment',
      entityId: payment.id,
    })

    const fresh = await one('select * from payments where id = $1', [payment.id])
    res.json({
      payment: fresh,
      accessRemoved: outcome.reversed > 0,
      message:
        outcome.reversed > 0
          ? 'Refunded. Access removed and the creator’s credit reversed.'
          : 'Refunded. There was no active purchase left to reverse.',
    })
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
      summary: `${who(req)} ${req.body.decision === 'paid' ? 'marked paid' : 'declined'} a withdrawal of TZS ${Number(w.amount_tzs).toLocaleString()}`,
      detail: { amountTzs: w.amount_tzs },
    })
    await notify({
      userId: w.creator_id, kind: 'account',
      title:
        req.body.decision === 'paid'
          ? `Your withdrawal of TZS ${Number(w.amount_tzs).toLocaleString()} was paid`
          : `Your withdrawal of TZS ${Number(w.amount_tzs).toLocaleString()} was declined`,
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

/* ----------------------------------------------------------- email health */
/**
 * Does outbound email actually work?
 *
 * `/health` reports `email: true` as soon as the three SMTP variables are
 * non-empty, which proves nothing — a wrong password looks identical to a right
 * one from there. That gap is how every password-reset request came back
 * "success" while nothing was ever delivered: the send failed, the failure was
 * swallowed to avoid leaking which addresses exist, and no screen anywhere said
 * the mailer was broken.
 *
 * This asks the server properly. It opens a connection and authenticates
 * without sending anything, and turns the raw SMTP error into something a
 * non-technical administrator can act on.
 */
const mailHint = (message = '') => {
  if (/invalid login|username and password|535|BadCredentials/i.test(message)) {
    return (
      'The mail server rejected the credentials. For Gmail, SMTP_PASS must be a ' +
      '16-character App Password — not the account password. ' +
      'Google Account → Security → 2-Step Verification → App passwords.'
    )
  }
  if (/does not match|553|not allowed to send as/i.test(message)) {
    return 'MAIL_FROM must be the same address as SMTP_USER, or an alias that address is allowed to send as.'
  }
  if (/self.signed|certificate|wrong version number|SSL/i.test(message)) {
    return 'TLS negotiation failed. Port 465 needs SMTP_SECURE=true; port 587 needs SMTP_SECURE=false.'
  }
  if (/timeout|ETIMEDOUT|ECONNREFUSED|ENOTFOUND/i.test(message)) {
    return 'Could not reach the mail server at all. Check SMTP_HOST and SMTP_PORT, and that the host allows outbound SMTP.'
  }
  return 'Check SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER and SMTP_PASS on the server.'
}

router.get(
  '/health/email',
  asyncHandler(async (_req, res) => {
    if (!capabilities.email) {
      return res.status(503).json({
        ok: false,
        configured: false,
        error: 'SMTP_HOST, SMTP_USER or SMTP_PASS is missing on the server.',
        hint: 'Set all three, then redeploy the API.',
      })
    }
    try {
      const info = await verifyMail()
      res.json({ ok: true, configured: true, host: info.host, from: info.from })
    } catch (err) {
      res.status(502).json({
        ok: false,
        configured: true,
        host: env.smtp.host,
        port: env.smtp.port,
        secure: env.smtp.secure,
        from: env.smtp.from,
        error: err.message,
        hint: mailHint(err.message),
      })
    }
  })
)

/**
 * Send a real message to the signed-in staff member.
 *
 * `verify()` only proves the credentials are accepted; it does not prove a
 * message survives the trip. Deliberately sent to the caller's own address and
 * nobody else's, so this can never be turned into a way to mail strangers.
 */
router.post(
  '/health/email',
  asyncHandler(async (req, res) => {
    if (!capabilities.email) throw badRequest('Email is not configured on the server.')
    const tpl = passwordChangedEmail({ name: req.user.full_name })
    try {
      const info = await sendMail({
        to: req.user.email,
        subject: 'MTONYO+ mail test',
        html: tpl.html,
      })
      res.json({ ok: true, sentTo: req.user.email, messageId: info.messageId })
    } catch (err) {
      res.status(502).json({ ok: false, sentTo: req.user.email, error: err.message, hint: mailHint(err.message) })
    }
  })
)

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
    invalidateSettingsCache()
    const settings = await updateSettings(req.body)
    await recordStaffAction(req, {
      action: 'CHANGED_SETTINGS', entityType: 'settings', entityId: '1',
      summary: `${who(req)} changed the platform settings`,
      detail: req.body,
    })
    res.json({ settings })
  })
)

/**
 * The permanent record, paged and filterable on the server.
 *
 * This returned the newest hundred rows and nothing else — no paging, no date
 * range, no way to ask "what did this person do". An audit log you cannot
 * query is a log nobody reads, and the answer to "who approved that video in
 * March" was to scroll until you found it, or to raise the limit until the
 * browser was holding thousands of rows it had no use for.
 *
 * Every filter is applied in SQL against indexed columns, and the total comes
 * back with the page so the interface can say where you are in it.
 */
router.get(
  '/audit',
  validateQuery(
    z.object({
      q: z.string().trim().max(120).optional(),
      /** Who did it. */
      actorId: z.string().uuid().optional(),
      /** Exactly which action, for when you already know what you are after. */
      action: z.string().trim().max(60).optional(),
      /** What kind of thing it was done to: video, profile, withdrawal… */
      entityType: z.string().trim().max(40).optional(),
      /** Inclusive date range, as plain YYYY-MM-DD. */
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      limit: z.coerce.number().int().min(1).max(200).default(50),
      offset: z.coerce.number().int().min(0).default(0),
    })
  ),
  asyncHandler(async (req, res) => {
    const { q, actorId, action, entityType, from, to, limit, offset } = req.validatedQuery

    const where = ['1=1']
    const params = []
    /**
     * One value, however many times it appears. The free-text search compares
     * the same term against four columns, so every `$?` in a fragment resolves
     * to the one parameter that was pushed for it.
     */
    const add = (sql, value) => {
      params.push(value)
      where.push(sql.replaceAll('$?', `$${params.length}`))
    }

    if (q) {
      add(
        '(a.action ilike $? or a.entity_type ilike $? or p.full_name ilike $? or p.email ilike $?)',
        `%${q}%`
      )
    }
    if (actorId) add('a.actor_id = $?', actorId)
    if (action) add('a.action = $?', action)
    if (entityType) add('a.entity_type = $?', entityType)
    if (from) add('a.created_at >= $?::date', from)
    // Inclusive of the whole end day, not midnight at the start of it.
    if (to) add("a.created_at < ($?::date + interval '1 day')", to)

    const clause = where.join(' and ')

    const [rows, total, actions] = await Promise.all([
      many(
        `select a.*, p.full_name as actor_name, p.email as actor_email
           from audit_log a left join profiles p on p.id = a.actor_id
          where ${clause}
          order by a.created_at desc
          limit $${params.length + 1} offset $${params.length + 2}`,
        [...params, limit, offset]
      ),
      one(
        `select count(*)::int as n
           from audit_log a left join profiles p on p.id = a.actor_id
          where ${clause}`,
        params
      ),
      /* The actions actually present, so the filter offers real choices
         rather than a list somebody has to keep in step by hand. */
      many(`select distinct action from audit_log order by action`),
    ])

    res.json({
      entries: rows,
      total: total?.n ?? 0,
      limit,
      offset,
      options: { actions: actions.map((r) => r.action) },
    })
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

/* ==========================================================================
   CREATOR APPLICATIONS

   Who is allowed to sell on the platform. Submitting an application changes
   nothing about an account; this is where it changes.
   ========================================================================== */

router.get(
  '/creator-applications',
  asyncHandler(async (req, res) => {
    const filter = String(req.query.status || '')
    const allowed = ['pending', 'approved', 'rejected', 'suspended', 'revoked']
    const status = allowed.includes(filter) ? filter : null
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100))

    const where =
      status === 'pending'
        ? `a.status = 'pending'`
        : status === 'approved'
          ? `a.status = 'approved' and p.role = 'creator' and p.status = 'active' and a.access_ended_at is null`
          : status === 'rejected'
            ? `a.status = 'rejected'`
            : status === 'suspended'
              ? `a.status = 'approved' and p.role = 'creator' and p.status <> 'active' and a.access_ended_at is null`
              : status === 'revoked'
                ? `a.access_ended_at is not null or (a.status = 'approved' and p.role <> 'creator')`
                : 'true'

    const rows = await many(
      `select a.*, p.role::text as current_role, p.status::text as account_status,
              d.email as decided_by_email
         from creator_applications a
         join profiles p on p.id = a.user_id
         left join profiles d on d.id = a.decided_by
        where ${where}
        order by case when a.status = 'pending' then 0 else 1 end,
                 a.created_at desc
        limit $1`,
      [limit]
    )

    const counts = await one(
      `select
          count(*) filter (where a.status = 'pending')::int as pending,
          count(*) filter (where a.status = 'approved' and p.role = 'creator'
                           and p.status = 'active' and a.access_ended_at is null)::int as approved,
          count(*) filter (where a.status = 'rejected')::int as rejected,
          count(*) filter (where a.status = 'approved' and p.role = 'creator'
                           and p.status <> 'active' and a.access_ended_at is null)::int as suspended,
          count(*) filter (where a.access_ended_at is not null
                           or (a.status = 'approved' and p.role <> 'creator'))::int as revoked
         from creator_applications a
         join profiles p on p.id = a.user_id`
    )

    res.json({
      applications: rows.map((r) => ({
        ...shapeApplication(r),
        userId: r.user_id,
        currentRole: r.current_role,
        accountStatus: r.account_status,
        decidedByEmail: r.decided_by_email,
      })),
      counts: {
        pending: counts?.pending || 0,
        approved: counts?.approved || 0,
        rejected: counts?.rejected || 0,
        suspended: counts?.suspended || 0,
        revoked: counts?.revoked || 0,
      },
    })
  })
)

/**
 * Approve or reject.
 *
 * Approval is the only place a viewer becomes a creator. The role change and
 * the creator profile are one transaction: a role without a profile is an
 * account that can upload and cannot be paid.
 */
router.post(
  '/creator-applications/:id/decide',
  validate(
    z.object({
      decision: z.enum(['approve', 'reject']),
      note: z.string().trim().max(1000).optional(),
    })
  ),
  asyncHandler(async (req, res) => {
    const app = await one('select * from creator_applications where id = $1', [req.params.id])
    if (!app) throw notFound('Application not found')
    if (app.status !== 'pending') throw conflict('This application has already been decided')

    const approving = req.body.decision === 'approve'

    const updated = await transaction(
      async (client) => {
        const { rows } = await client.query(
          `update creator_applications
              set status = $2, decided_by = $3, decided_at = now(),
                  decision_note = $4, updated_at = now()
            where id = $1
            returning *`,
          [app.id, approving ? 'approved' : 'rejected', req.user.id, req.body.note || null]
        )

        if (approving) {
          await client.query(`update profiles set role = 'creator' where id = $1`, [app.user_id])
          await client.query(
            `insert into creator_profiles
               (user_id, display_name, payout_phone, bio, location, category, socials)
             values ($1,$2,$3,$4,$5,$6,$7::jsonb)
             on conflict (user_id) do update
               set display_name = coalesce(creator_profiles.display_name, excluded.display_name),
                   bio = coalesce(creator_profiles.bio, excluded.bio),
                   location = coalesce(creator_profiles.location, excluded.location),
                   category = coalesce(creator_profiles.category, excluded.category),
                   socials = case
                     when creator_profiles.socials is null or creator_profiles.socials = '[]'::jsonb
                     then excluded.socials
                     else creator_profiles.socials
                   end`,
            [
              app.user_id,
              app.stage_name,
              app.phone,
              app.bio || app.description || null,
              app.location || null,
              app.category && app.category !== 'Not stated' ? app.category : null,
              JSON.stringify(app.socials || []),
            ]
          )
        }

        return rows[0]
      },
      { actorRole: 'admin', actorId: req.user.id }
    )
    invalidateProfileCache(app.user_id)

    await recordAudit({
      actorId: req.user.id,
      action: approving ? 'CREATOR_APPROVED' : 'CREATOR_REJECTED',
      entityType: 'creator_application',
      entityId: app.id,
      summary: `${who(req)} ${approving ? 'approved' : 'rejected'} ${app.stage_name}`,
      ip: clientIp(req),
    })

    await notify({
      userId: app.user_id,
      kind: 'account',
      title: approving ? 'You are now a creator on MTONYO+' : 'About your creator application',
      body: approving
        ? 'Your application was approved. The creator dashboard is open — you can upload, set your price and track earnings.'
        : req.body.note ||
          'Your application was not approved this time. You are welcome to apply again.',
      actor: req.user,
      action: approving ? 'CREATOR_APPROVED' : 'CREATOR_REJECTED',
      entityType: 'creator_application',
      entityId: app.id,
    }).catch(() => {})

    res.json({ application: { id: updated.id, status: updated.status } })
  })
)

/**
 * Take creator access away again.
 *
 * The account returns to being a viewer and keeps everything it bought. The
 * videos are not touched here — publishing decisions belong to the review and
 * moderation screens, and revoking access is not the same as a takedown.
 */
router.post(
  '/creators/:id/revoke',
  validate(z.object({ note: z.string().trim().max(1000).optional() })),
  asyncHandler(async (req, res) => {
    const target = await one(`select id, email, role::text as role from profiles where id = $1`, [
      req.params.id,
    ])
    if (!target) throw notFound('Account not found')
    if (target.role !== 'creator') throw conflict('That account is not a creator')

    await transaction(
      async (client) => {
        await client.query(
          `update profiles set role = 'viewer', viewer_enabled = true where id = $1`,
          [target.id]
        )
        await client.query(
          `update creator_applications
              set access_ended_at = now(), access_ended_by = $2, access_end_note = $3,
                  updated_at = now()
            where user_id = $1 and status = 'approved' and access_ended_at is null`,
          [target.id, req.user.id, req.body.note || 'Creator access revoked']
        )
      },
      { actorRole: 'admin', actorId: req.user.id }
    )
    invalidateProfileCache(target.id)

    await recordAudit({
      actorId: req.user.id,
      action: 'CREATOR_REVOKED',
      entityType: 'profile',
      entityId: target.id,
      summary: `${who(req)} revoked creator access for ${target.email}`,
      ip: clientIp(req),
    })

    await notify({
      userId: target.id,
      kind: 'account',
      title: 'Creator access has been removed',
      body: req.body.note || 'Your account is a viewer account again. Anything you bought is still yours.',
      actor: req.user,
    }).catch(() => {})

    res.json({ ok: true })
  })
)

/**
 * Pause a creator without taking the role away. They can still sign in and
 * their videos stay up; they cannot upload or change anything until restored.
 */
router.post(
  '/creators/:id/suspend',
  validate(z.object({ note: z.string().trim().max(1000).optional() })),
  asyncHandler(async (req, res) => {
    const target = await one(
      `select id, email, role::text as role, status::text as status from profiles where id = $1`,
      [req.params.id]
    )
    if (!target) throw notFound('Account not found')
    if (target.role !== 'creator') throw conflict('That account is not a creator')
    if (target.status === 'blocked') throw conflict('That account is blocked — restore it from Users')

    const updated = await one(`update profiles set status = 'suspended' where id = $1 returning *`, [
      target.id,
    ])
    invalidateProfileCache(target.id)

    await recordAudit({
      actorId: req.user.id,
      action: 'CREATOR_SUSPENDED',
      entityType: 'profile',
      entityId: target.id,
      summary: `${who(req)} suspended creator ${target.email}`,
      ip: clientIp(req),
    })

    await notify({
      userId: target.id,
      kind: 'account',
      title: 'Your creator account is suspended',
      body:
        req.body.note ||
        'You can still sign in, but you cannot upload or change anything until the team restores you.',
      actor: req.user,
    }).catch(() => {})

    res.json({ ok: true, status: updated.status })
  })
)

router.post(
  '/creators/:id/restore',
  asyncHandler(async (req, res) => {
    const target = await one(
      `select id, email, role::text as role, status::text as status from profiles where id = $1`,
      [req.params.id]
    )
    if (!target) throw notFound('Account not found')
    if (target.role !== 'creator') throw conflict('That account is not a creator')

    const updated = await one(`update profiles set status = 'active' where id = $1 returning *`, [
      target.id,
    ])
    invalidateProfileCache(target.id)

    await recordAudit({
      actorId: req.user.id,
      action: 'CREATOR_RESTORED',
      entityType: 'profile',
      entityId: target.id,
      summary: `${who(req)} restored creator ${target.email}`,
      ip: clientIp(req),
    })

    await notify({
      userId: target.id,
      kind: 'account',
      title: 'Your creator account has been restored',
      body: 'You can upload and manage your videos again.',
      actor: req.user,
    }).catch(() => {})

    res.json({ ok: true, status: updated.status })
  })
)

export default router
