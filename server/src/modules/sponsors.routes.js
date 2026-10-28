import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { one, many, query } from '../db/pool.js'
import { asyncHandler, badRequest, notFound } from '../lib/errors.js'
import { validate } from '../middleware/validate.js'
import { requireAuth, requireStaff, requirePermission } from '../middleware/auth.js'
import { recordStaffAction } from '../services/audit.js'
import { storeImage, removeImage } from '../services/uploads.js'
import { log } from '../lib/logger.js'

/**
 * Homepage sponsor ads (Milestone 3).
 *
 *   GET  /api/sponsors                 the live banners, for the homepage
 *   POST /api/sponsors/:id/impression  counted once per viewer session (client-side)
 *   GET  /api/sponsors/:id/click       counts the click, then 302 to the sponsor
 *
 *   /api/sponsors/manage/…             Super Admin / staff with the Ads module
 */
const router = Router()

/** Live right now: switched on and inside its dates. */
const LIVE = `active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())`
const MAX_LIVE = 5

export const publicSponsor = (s) => ({
  id: s.id,
  sponsor: s.sponsor,
  title: s.title,
  tagline: s.tagline,
  cta: s.cta || 'Learn more',
  imageUrl: s.image_url,
  // The click goes through us so it can be counted; the sponsor's address is
  // never taken from the request.
  clickPath: `/api/sponsors/${s.id}/click`,
})

const uuid = z.string().uuid()

/* ---------------------------------------------------------------- public */

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = await many(
      `select * from home_sponsors where ${LIVE} order by position asc, created_at desc limit ${MAX_LIVE}`
    )
    // Short shared cache: a newly switched-off banner disappears within a minute.
    res.set('Cache-Control', 'public, max-age=60')
    res.json({ sponsors: rows.map(publicSponsor) })
  })
)

router.post(
  '/:id/impression',
  asyncHandler(async (req, res) => {
    if (!uuid.safeParse(req.params.id).success) throw notFound('Unknown sponsor')
    await query(`update home_sponsors set impressions = impressions + 1 where id = $1 and ${LIVE}`, [req.params.id])
    res.status(204).end()
  })
)

router.get(
  '/:id/click',
  asyncHandler(async (req, res) => {
    if (!uuid.safeParse(req.params.id).success) throw notFound('Unknown sponsor')
    const s = await one(
      `update home_sponsors set clicks = clicks + 1 where id = $1 and ${LIVE} returning click_url`,
      [req.params.id]
    )
    if (!s) throw notFound('This sponsor is no longer running')
    res.set('Cache-Control', 'no-store')
    res.redirect(302, s.click_url)
  })
)

/* ----------------------------------------------------------------- admin */

const manage = Router()
manage.use(requireAuth(), requireStaff(), requirePermission('ads'))

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 6 * 1024 * 1024, files: 1 } })

const text = (max) => z.string().trim().min(1).max(max)
const optionalText = (max) => z.string().trim().max(max).nullish().transform((v) => (v ? v : null))
const when = z.string().datetime({ offset: true }).nullish().transform((v) => v || null)
const httpUrl = z
  .string()
  .trim()
  .max(500)
  .url('Enter the full web address, starting with https://')
  .refine((u) => /^https?:\/\//i.test(u), 'Only http(s) links are allowed')

export const sponsorBody = z
  .object({
    sponsor: text(80),
    title: text(80),
    tagline: optionalText(160),
    cta: optionalText(30),
    clickUrl: httpUrl,
    active: z.boolean().default(true),
    startsAt: when,
    endsAt: when,
    position: z.coerce.number().int().min(0).max(999).default(0),
  })
  .refine((b) => !b.startsAt || !b.endsAt || new Date(b.endsAt) > new Date(b.startsAt), {
    message: 'The end date must be after the start date',
    path: ['endsAt'],
  })

const adminSponsor = (s) => ({
  ...publicSponsor(s),
  clickUrl: s.click_url,
  active: s.active,
  startsAt: s.starts_at,
  endsAt: s.ends_at,
  position: s.position,
  impressions: s.impressions,
  clicks: s.clicks,
  ctr: s.impressions ? Math.round((s.clicks / s.impressions) * 1000) / 10 : 0,
  live: Boolean(s.live),
  createdAt: s.created_at,
  updatedAt: s.updated_at,
})

const withLive = `*, (${LIVE}) as live`

manage.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = await many(`select ${withLive} from home_sponsors order by position asc, created_at desc`)
    res.json({ sponsors: rows.map(adminSponsor), maxLive: MAX_LIVE })
  })
)

manage.post(
  '/',
  validate(sponsorBody),
  asyncHandler(async (req, res) => {
    const b = req.body
    const s = await one(
      `insert into home_sponsors (sponsor, title, tagline, cta, click_url, active, starts_at, ends_at, position, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning ${withLive}`,
      [b.sponsor, b.title, b.tagline, b.cta, b.clickUrl, b.active, b.startsAt, b.endsAt, b.position, req.user.id]
    )
    await recordStaffAction(req, { action: 'CREATED_SPONSOR', entityType: 'home_sponsor', entityId: s.id, summary: `added homepage sponsor "${s.sponsor}"` })
    res.status(201).json({ sponsor: adminSponsor(s) })
  })
)

manage.patch(
  '/:id',
  validate(sponsorBody),
  asyncHandler(async (req, res) => {
    if (!uuid.safeParse(req.params.id).success) throw notFound('Sponsor not found')
    const b = req.body
    const s = await one(
      `update home_sponsors
          set sponsor = $2, title = $3, tagline = $4, cta = $5, click_url = $6, active = $7,
              starts_at = $8, ends_at = $9, position = $10, updated_at = now()
        where id = $1 returning ${withLive}`,
      [req.params.id, b.sponsor, b.title, b.tagline, b.cta, b.clickUrl, b.active, b.startsAt, b.endsAt, b.position]
    )
    if (!s) throw notFound('Sponsor not found')
    await recordStaffAction(req, { action: 'UPDATED_SPONSOR', entityType: 'home_sponsor', entityId: s.id, summary: `updated homepage sponsor "${s.sponsor}"${s.active ? '' : ' (switched off)'}` })
    res.json({ sponsor: adminSponsor(s) })
  })
)

manage.post(
  '/:id/image',
  upload.single('image'),
  asyncHandler(async (req, res) => {
    if (!uuid.safeParse(req.params.id).success) throw notFound('Sponsor not found')
    if (!req.file) throw badRequest('Choose an image to upload')
    const before = await one('select image_url, sponsor from home_sponsors where id = $1', [req.params.id])
    if (!before) throw notFound('Sponsor not found')
    const { url } = await storeImage({ bucket: 'thumbnails', file: req.file, userId: req.user.id, accessToken: req.accessToken })
    const s = await one(`update home_sponsors set image_url = $2, updated_at = now() where id = $1 returning ${withLive}`, [req.params.id, url])
    if (before.image_url) removeImage({ bucket: 'thumbnails', url: before.image_url, accessToken: req.accessToken }).catch(() => {})
    await recordStaffAction(req, { action: 'UPDATED_SPONSOR', entityType: 'home_sponsor', entityId: s.id, summary: `changed the banner image of "${s.sponsor}"` })
    res.json({ sponsor: adminSponsor(s) })
  })
)

manage.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    if (!uuid.safeParse(req.params.id).success) throw notFound('Sponsor not found')
    const s = await one('delete from home_sponsors where id = $1 returning *', [req.params.id])
    if (!s) throw notFound('Sponsor not found')
    if (s.image_url) removeImage({ bucket: 'thumbnails', url: s.image_url, accessToken: req.accessToken }).catch((err) => log.warn(err.message))
    await recordStaffAction(req, { action: 'DELETED_SPONSOR', entityType: 'home_sponsor', entityId: s.id, summary: `removed homepage sponsor "${s.sponsor}" (${s.impressions} views, ${s.clicks} clicks)` })
    res.json({ ok: true })
  })
)

// Mounted first so "manage" is never read as a sponsor id.
const root = Router()
root.use('/manage', manage)
root.use('/', router)
export default root
