import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { one, many, query, transaction } from '../db/pool.js'
import { asyncHandler, badRequest } from '../lib/errors.js'
import { validate } from '../middleware/validate.js'
import { requireAuth, hasCreatorAccess } from '../middleware/auth.js'
import { storeImage, removeImage } from '../services/uploads.js'
import { verifyPassword } from '../lib/authdb.js'
import { notify, notifyMany } from '../services/notify.js'
import { recordAudit, clientIp } from '../services/audit.js'
import { rebuildShareCardsForCreator } from '../lib/buildShareCard.js'
import { isKnownCategory } from '../lib/categories.js'
import { isKnownContentType, shapeApplication } from '../lib/creatorApplication.js'

/**
 * Everything about *your own* account: who you are, how you are paid, what we
 * may email you about, and how you have been getting on.
 *
 * Deliberately one module for viewers and creators alike. On this platform one
 * account both watches and sells, so splitting it would mean two of everything
 * and two places for them to drift apart.
 */
const router = Router()
router.use(requireAuth())

// In memory: these are small images on their way somewhere else, and writing
// them to disk on a serverless host would be writing to a disk that vanishes.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024, files: 1 },
})

/* ====================================================================
   WHO I AM
   ==================================================================== */

const shape = (p, creator) => ({
  user: {
    id: p.id,
    email: p.email,
    fullName: p.full_name,
    phone: p.phone,
    role: p.role,
    status: p.status,
    avatarUrl: p.avatar_url,
    bio: p.bio,
    location: p.location,
    website: p.website,
    createdAt: p.created_at,
    preferences: {
      emailAnnouncements: p.email_announcements,
      emailAccountNews: p.email_account_news,
    },
  },
  creator: creator
    ? {
        displayName: creator.display_name,
        bio: creator.bio,
        location: creator.location,
        verified: creator.verified,
        followers: creator.followers,
        revenueSplitPercent: creator.revenue_split_percent,
        payoutPhone: creator.payout_phone,
        payoutMethod: creator.payout_method,
      }
    : null,
})

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const [profile, creator] = await Promise.all([
      one('select * from profiles where id = $1', [req.user.id]),
      one('select * from creator_profiles where user_id = $1', [req.user.id]),
    ])
    res.json(shape(profile, creator))
  })
)

const profileSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Enter your name').max(120).optional(),
    phone: z.string().trim().regex(/^[0-9+\s-]{9,15}$/, 'Enter a valid phone number').optional().or(z.literal('')),
    bio: z.string().trim().max(500).optional().or(z.literal('')),
    location: z.string().trim().max(120).optional().or(z.literal('')),
    website: z.string().trim().url('Enter a full web address, starting with https://').max(200).optional().or(z.literal('')),

    // creator-only, ignored for anyone else
    displayName: z.string().trim().min(2).max(120).optional(),
    payoutPhone: z.string().trim().regex(/^[0-9+\s-]{9,15}$/, 'Enter a valid mobile money number').optional().or(z.literal('')),
    payoutMethod: z.enum(['mpesa', 'airtel']).optional(),

    emailAnnouncements: z.boolean().optional(),
    emailAccountNews: z.boolean().optional(),

    /**
     * Required only when the payout details change — see below.
     */
    currentPassword: z.string().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to change' })

router.patch(
  '/',
  validate(profileSchema),
  asyncHandler(async (req, res) => {
    const b = req.body

    /**
     * Changing where the money goes is a sensitive action.
     *
     * Everything else on this form is a preference; the payout number is the
     * bank account. Somebody who gets thirty seconds at an unlocked phone could
     * otherwise point a creator's entire earnings at their own line, and the
     * creator would find out at the next withdrawal.
     *
     * So it costs a password — and the account is told afterwards, because the
     * notification is how a creator learns about a change they did not make.
     */
    const changingPayout = b.payoutPhone !== undefined || b.payoutMethod !== undefined
    if (changingPayout) {
      const current = await one(
        'select payout_phone, payout_method from creator_profiles where user_id = $1',
        [req.user.id]
      )
      const reallyChanging =
        (b.payoutPhone !== undefined && (b.payoutPhone || null) !== (current?.payout_phone || null)) ||
        (b.payoutMethod !== undefined && (b.payoutMethod || null) !== (current?.payout_method || null))

      if (reallyChanging) {
        if (!b.currentPassword) {
          throw badRequest('Confirm your password to change your payout details')
        }
        const ok = await verifyPassword(req.user.id, b.currentPassword)
        if (!ok) throw badRequest('Your current password is not correct')
      }
    }

    /**
     * An empty string means "clear this", null means "leave it alone". They are
     * different intentions and the query has to tell them apart, or a person
     * emptying their bio would find it silently unchanged.
     */
    const clearable = (v) => (v === undefined ? null : v === '' ? '' : v)

    const { profile, creator } = await transaction(
      async (c) => {
        const { rows } = await c.query(
          `update profiles set
             full_name           = coalesce($2, full_name),
             phone               = case when $3::text is null then phone     when $3 = '' then null else $3 end,
             bio                 = case when $4::text is null then bio       when $4 = '' then null else $4 end,
             location            = case when $5::text is null then location  when $5 = '' then null else $5 end,
             website             = case when $6::text is null then website   when $6 = '' then null else $6 end,
             email_announcements = coalesce($7, email_announcements),
             email_account_news  = coalesce($8, email_account_news),
             updated_at          = now()
           where id = $1 returning *`,
          [
            req.user.id,
            b.fullName ?? null,
            clearable(b.phone),
            clearable(b.bio),
            clearable(b.location),
            clearable(b.website),
            b.emailAnnouncements ?? null,
            b.emailAccountNews ?? null,
          ]
        )

        let creatorRow = null
        if (await hasCreatorAccess(req.user)) {
          const upd = await c.query(
            `update creator_profiles set
               display_name  = coalesce($2, display_name),
               bio           = case when $3::text is null then bio      when $3 = '' then null else $3 end,
               location      = case when $4::text is null then location when $4 = '' then null else $4 end,
               payout_phone  = case when $5::text is null then payout_phone when $5 = '' then null else $5 end,
               payout_method = coalesce($6, payout_method)
             where user_id = $1 returning *`,
            [
              req.user.id,
              b.displayName ?? null,
              clearable(b.bio),
              clearable(b.location),
              clearable(b.payoutPhone),
              b.payoutMethod ?? null,
            ]
          )
          creatorRow = upd.rows[0] || null
        }

        return { profile: rows[0], creator: creatorRow }
      },
      { actorRole: 'system', actorId: req.user.id }
    )

    /**
     * Tell them it happened. The password stops a stranger making the change;
     * this is how the creator finds out if one somehow did — and the audit row
     * is what an administrator reads when a payout is disputed. The number
     * itself is deliberately not written to the log.
     */
    if (changingPayout) {
      await recordAudit({
        actorId: req.user.id,
        action: 'CHANGED_PAYOUT_DETAILS',
        entityType: 'profile',
        entityId: req.user.id,
        detail: { method: creator?.payout_method ?? null },
        ip: clientIp(req),
      })
      await notify({
        userId: req.user.id,
        kind: 'account',
        title: 'Your payout details were changed',
        body: 'If this was not you, change your password immediately and contact support.',
        action: 'payout_details',
      })
    }

    if (b.displayName != null) {
      rebuildShareCardsForCreator(req.user.id).catch(() => {})
    }

    res.json(shape(profile, creator))
  })
)

/* ====================================================================
   MY PICTURE
   ==================================================================== */

router.post(
  '/avatar',
  upload.single('image'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('Choose an image to upload')

    const previous = req.user.avatar_url

    const { url } = await storeImage({
      bucket: 'avatars',
      file: req.file,
      userId: req.user.id,
      accessToken: req.accessToken,
    })

    const profile = await one(
      'update profiles set avatar_url = $2, updated_at = now() where id = $1 returning *',
      [req.user.id, url]
    )

    // Tidy the old one away, but never at the cost of the new one.
    if (previous) {
      removeImage({ bucket: 'avatars', url: previous, accessToken: req.accessToken }).catch(() => {})
    }

    res.json({ avatarUrl: profile.avatar_url })
  })
)

router.delete(
  '/avatar',
  asyncHandler(async (req, res) => {
    const previous = req.user.avatar_url
    await query('update profiles set avatar_url = null, updated_at = now() where id = $1', [req.user.id])
    if (previous) {
      removeImage({ bucket: 'avatars', url: previous, accessToken: req.accessToken }).catch(() => {})
    }
    res.json({ avatarUrl: null })
  })
)

/* ====================================================================
   HOW I HAVE BEEN GETTING ON
   --------------------------------------------------------------------
   A creator wants to know what is selling. A viewer wants to know what
   they have spent and what they own. Same route, different question,
   because they are the same person wearing a different hat.
   ==================================================================== */

router.get(
  '/analytics',
  asyncHandler(async (req, res) => {
    const isCreator = await hasCreatorAccess(req.user)

    /* ---------------- what I have watched and bought ---------------- */
    const [spend, owned, recent] = await Promise.all([
      one(
        `select count(*)::int as purchases,
                coalesce(sum(amount_tzs),0)::int as spent_tzs
           from purchases where user_id = $1 and status = 'active'`,
        [req.user.id]
      ),
      one(
        `select count(*)::int as videos,
                coalesce(sum(v.duration_seconds),0)::int as seconds
           from purchases p join videos v on v.id = p.video_id
          where p.user_id = $1 and p.status = 'active'`,
        [req.user.id]
      ),
      many(
        `select p.purchased_at, p.amount_tzs, v.title, v.slug, v.id as video_id
           from purchases p join videos v on v.id = p.video_id
          where p.user_id = $1 and p.status = 'active'
          order by p.purchased_at desc limit 8`,
        [req.user.id]
      ),
    ])

    const viewer = {
      purchases: spend.purchases,
      spentTzs: spend.spent_tzs,
      videosOwned: owned.videos,
      ownedSeconds: owned.seconds,
      recent: recent.map((r) => ({
        videoId: r.video_id,
        title: r.title,
        slug: r.slug,
        amountTzs: r.amount_tzs,
        purchasedAt: r.purchased_at,
      })),
    }

    if (!isCreator) return res.json({ role: 'viewer', viewer, creator: null })

    /* ------------------------- what I am selling ------------------------- */
    const [totals, daily, topVideos, byAccess] = await Promise.all([
      one(
        `select count(*)::int as videos,
                count(*) filter (where is_published)::int as published,
                coalesce(sum(views),0)::int as views,
                coalesce(sum(paid_unlocks),0)::int as unlocks
           from videos where creator_id = $1 and deleted_at is null`,
        [req.user.id]
      ),
      many(
        `select date_trunc('day', created_at)::date as day,
                coalesce(sum(creator_tzs),0)::int as amount,
                count(*)::int as sales
           from earnings
          where creator_id = $1 and created_at > now() - interval '30 days'
          group by 1 order by 1`,
        [req.user.id]
      ),
      many(
        `select v.id, v.title, v.slug, v.views, v.paid_unlocks, v.access_type, v.price_tzs,
                coalesce((select sum(creator_tzs)::int from earnings e where e.video_id = v.id), 0) as earned_tzs
           from videos v
          where v.creator_id = $1 and v.deleted_at is null
          order by earned_tzs desc, v.views desc
          limit 10`,
        [req.user.id]
      ),
      many(
        `select access_type, count(*)::int as videos,
                coalesce(sum(views),0)::int as views
           from videos
          where creator_id = $1 and deleted_at is null and is_published
          group by access_type`,
        [req.user.id]
      ),
    ])

    /**
     * How many people who watched went on to pay. The single most useful
     * number a creator has, and the one nobody can work out in their head.
     */
    const conversion = totals.views > 0 ? (totals.unlocks / totals.views) * 100 : null

    res.json({
      role: 'creator',
      viewer,
      creator: {
        videos: totals.videos,
        published: totals.published,
        views: totals.views,
        paidUnlocks: totals.unlocks,
        conversionPercent: conversion === null ? null : Math.round(conversion * 10) / 10,
        daily: daily.map((d) => ({ day: d.day, amountTzs: d.amount, sales: d.sales })),
        topVideos: topVideos.map((v) => ({
          id: v.id,
          title: v.title,
          slug: v.slug,
          views: v.views,
          paidUnlocks: v.paid_unlocks,
          accessType: v.access_type,
          priceTzs: v.price_tzs,
          earnedTzs: v.earned_tzs,
        })),
        byAccessType: byAccess.map((a) => ({
          accessType: a.access_type,
          videos: a.videos,
          views: a.views,
        })),
      },
    })
  })
)

/* ====================================================================
   CLOSING THE ACCOUNT
   ==================================================================== */

router.post(
  '/close',
  validate(z.object({ confirm: z.literal('DELETE', { errorMap: () => ({ message: 'Type DELETE to confirm' }) }) })),
  asyncHandler(async (req, res) => {
    /**
     * Not a deletion, and deliberately so.
     *
     * Money has moved through this account. Purchases have to keep pointing at
     * a real buyer, earnings at a real creator, and the audit log at a real
     * person, or the platform's own records stop making sense. So the account
     * is closed: they cannot sign in, and an administrator can still answer
     * "who bought this" a year from now.
     */
    if (req.user.role === 'admin' || req.user.role === 'sub_admin') {
      throw badRequest('Staff accounts are closed by another administrator, not from here')
    }

    const live = await one(
      `select count(*)::int as n from videos
        where creator_id = $1 and is_published and deleted_at is null`,
      [req.user.id]
    )
    if (live.n > 0) {
      throw badRequest(
        `You have ${live.n} published video(s). Ask for them to be taken down first — ` +
          'people who bought them need to be dealt with properly.'
      )
    }

    await transaction(
      (c) => c.query(`update profiles set status = 'blocked', updated_at = now() where id = $1`, [req.user.id]),
      { actorRole: 'admin', actorId: req.user.id }
    )

    await recordAudit({
      actorId: req.user.id,
      action: 'CLOSED_OWN_ACCOUNT',
      entityType: 'profile',
      entityId: req.user.id,
      ip: clientIp(req),
    })

    res.json({
      ok: true,
      message:
        'Your account is closed. Anything you bought is preserved — contact support if you want it back.',
    })
  })
)

/* ==========================================================================
   APPLYING TO BECOME A CREATOR

   Submitting does not make anybody a creator. It creates a record for staff
   to read, and the account stays exactly what it was — a viewer, with a
   viewer's permissions — until an administrator approves it. Approval is the
   only thing that moves the role, and it happens in admin.routes.js.
   ========================================================================== */

const CREATOR_TERMS =
  'I confirm I hold the rights to the content I publish on MTONYO+ and accept the MTONYO+ Creator Terms.'

const urlList = (label, { min, max }) =>
  z
    .array(z.string().trim().url(`Each ${label} must be a full web address`))
    .min(min, `Add at least one ${label}`)
    .max(max)

const applicationSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your full name').max(120),
  stageName: z.string().trim().min(2, 'Enter your creator or business name').max(120),
  email: z.string().trim().email('Enter an email address'),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\s-]{9,15}$/, 'Enter the phone number we can reach you on'),
  location: z.string().trim().min(2, 'Enter your city or country').max(120),
  contentType: z
    .string()
    .trim()
    .min(2, 'Choose the type of content you make')
    .refine(isKnownContentType, 'Choose a type of content from the list'),
  category: z
    .string()
    .trim()
    .min(2, 'Choose your main category')
    .refine(isKnownCategory, 'Choose a category from the list'),
  bio: z
    .string()
    .trim()
    .min(30, 'Tell us who you are — a short bio, at least a sentence or two')
    .max(1000),
  description: z
    .string()
    .trim()
    .min(30, 'Tell us a little more about what you will publish')
    .max(2000),
  whyJoin: z
    .string()
    .trim()
    .min(30, 'Tell us why you want to join MTONYO+')
    .max(1000),
  followers: z.string().trim().min(1, 'Tell us your follower count').max(200),
  engagement: z.string().trim().min(1, 'Tell us how your audience engages').max(500),
  socials: urlList('social link', { min: 1, max: 6 }),
  sampleWork: urlList('sample', { min: 1, max: 6 }),
  acceptTerms: z.literal(true, {
    errorMap: () => ({ message: 'You must accept the Creator Terms to apply' }),
  }),
})

/** What this account's application looks like right now, if there is one. */
router.get(
  '/creator-application',
  asyncHandler(async (req, res) => {
    const row = await one(
      `select id, status::text as status, full_name, stage_name, email, phone,
              location, content_type, category, bio, description, why_join,
              followers, engagement, socials, sample_work, decision_note,
              decided_at, created_at, terms_accepted_at, access_ended_at,
              access_end_note
         from creator_applications
        where user_id = $1
        order by created_at desc
        limit 1`,
      [req.user.id]
    )

    res.json({
      role: req.user.role,
      terms: CREATOR_TERMS,
      application: shapeApplication(row),
    })
  })
)

router.post(
  '/creator-application',
  validate(applicationSchema),
  asyncHandler(async (req, res) => {
    if (req.user.role === 'creator') throw badRequest('This account is already a creator')
    if (req.user.role === 'admin' || req.user.role === 'sub_admin') {
      throw badRequest('Staff accounts cannot apply — use a viewer account')
    }

    const open = await one(
      `select id from creator_applications where user_id = $1 and status = 'pending'`,
      [req.user.id]
    )
    if (open) throw badRequest('Your application is already with the team')

    const b = req.body
    const row = await one(
      `insert into creator_applications
         (user_id, full_name, stage_name, email, phone, location, content_type,
          category, bio, description, why_join, followers, engagement, socials,
          sample_work, terms_accepted_at, terms_statement)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15::jsonb, now(), $16)
       returning id, status::text as status, created_at`,
      [
        req.user.id,
        b.fullName,
        b.stageName,
        b.email.toLowerCase(),
        b.phone,
        b.location,
        b.contentType,
        b.category,
        b.bio,
        b.description,
        b.whyJoin,
        b.followers,
        b.engagement,
        JSON.stringify(b.socials || []),
        JSON.stringify(b.sampleWork || []),
        CREATOR_TERMS,
      ]
    )

    await recordAudit({
      actorId: req.user.id,
      action: 'CREATOR_APPLIED',
      entityType: 'creator_application',
      entityId: row.id,
      summary: `${b.stageName} applied to become a creator`,
      ip: clientIp(req),
    })

    // Staff need to know there is something waiting; the applicant needs to
    // know it arrived and that nothing else is expected of them.
    const staff = await many(
      `select id from profiles where role in ('admin', 'sub_admin') and status = 'active'`
    )
    await notifyMany(
      staff.map((x) => x.id),
      {
        kind: 'review',
        title: 'New creator application',
        body: `${b.stageName} (${b.email}) has applied to publish on MTONYO+.`,
        actor: req.user,
        action: 'CREATOR_APPLIED',
        entityType: 'creator_application',
        entityId: row.id,
      }
    ).catch(() => {})

    await notify({
      userId: req.user.id,
      title: 'Creator application received',
      body: 'The team will review it and let you know. Nothing else is needed from you.',
      kind: 'account',
    }).catch(() => {})

    res.status(201).json({
      application: { id: row.id, status: row.status, createdAt: row.created_at },
    })
  })
)

export default router
