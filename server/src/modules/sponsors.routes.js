import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { one, many, query } from '../db/pool.js'
import { asyncHandler, badRequest, conflict, notFound } from '../lib/errors.js'
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
 *
 * The admin flow (client, 2026-11-17):
 *   UPLOAD → PREVIEW → SAVE DRAFT → PUBLISH/SCHEDULE → EDIT/PAUSE → VIEW STATS
 * `state` is the admin's choice (draft / published / paused / ended); whether a
 * published banner is scheduled, live or past its end date follows from its dates.
 */
const router = Router()

/** Live right now: switched on and inside its dates. */
const LIVE = `state = 'published' and active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())`
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

/** One more view or click on today's row (Dar es Salaam date), for the stats. */
async function countDay(id, column) {
  const col = column === 'clicks' ? 'clicks' : 'impressions'
  await query(
    `insert into home_sponsor_daily (sponsor_id, day, ${col}) values ($1, (now() at time zone 'Africa/Dar_es_Salaam')::date, 1)
     on conflict (sponsor_id, day) do update set ${col} = home_sponsor_daily.${col} + 1`,
    [id]
  ).catch((err) => log.warn(`sponsor ${col} day count: ${err.message}`))
}

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
    const hit = await one(`update home_sponsors set impressions = impressions + 1 where id = $1 and ${LIVE} returning id`, [req.params.id])
    if (hit) await countDay(hit.id, 'impressions')
    res.status(204).end()
  })
)

router.get(
  '/:id/click',
  asyncHandler(async (req, res) => {
    if (!uuid.safeParse(req.params.id).success) throw notFound('Unknown sponsor')
    const s = await one(
      `update home_sponsors set clicks = clicks + 1 where id = $1 and ${LIVE} returning id, click_url`,
      [req.params.id]
    )
    if (!s) throw notFound('This sponsor is no longer running')
    await countDay(s.id, 'clicks')
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
    /** Save without showing it (to preview first, or finish later). */
    draft: z.boolean().optional(),
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
  state: s.state,
  status: sponsorStatus(s),
  endedAt: s.ended_at,
  createdAt: s.created_at,
  updatedAt: s.updated_at,
})

const withLive = `*, (${LIVE}) as live`

/** Draft / Scheduled / Live / Paused / Ended, as the admin list shows it. */
export function sponsorStatus(s, now = new Date()) {
  if (s.state === 'draft') return 'draft'
  if (s.state === 'ended') return 'ended'
  if (s.ends_at && new Date(s.ends_at) <= now) return 'ended'
  if (s.state === 'paused' || !s.active) return 'paused'
  if (s.starts_at && new Date(s.starts_at) > now) return 'scheduled'
  return 'live'
}

/** What a create / edit asks for: a draft stays a draft until published. */
const stateFor = (b, current) => {
  if (b.draft === true) return 'draft'
  if (current === 'ended') return 'ended'
  if (b.draft === false) return b.active === false ? 'paused' : 'published'
  if (current === 'draft') return 'draft'
  return b.active === false ? 'paused' : 'published'
}

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
      `insert into home_sponsors (sponsor, title, tagline, cta, click_url, active, starts_at, ends_at, position, created_by, state)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning ${withLive}`,
      [b.sponsor, b.title, b.tagline, b.cta, b.clickUrl, stateFor(b) === 'published', b.startsAt, b.endsAt, b.position, req.user.id, stateFor(b)]
    )
    await recordStaffAction(req, { action: 'CREATED_SPONSOR', entityType: 'home_sponsor', entityId: s.id, summary: `${s.state === 'draft' ? 'saved a draft of' : 'added'} homepage sponsor "${s.sponsor}"` })
    res.status(201).json({ sponsor: adminSponsor(s) })
  })
)

manage.patch(
  '/:id',
  validate(sponsorBody),
  asyncHandler(async (req, res) => {
    if (!uuid.safeParse(req.params.id).success) throw notFound('Sponsor not found')
    const b = req.body
    const before = await one('select state from home_sponsors where id = $1', [req.params.id])
    if (!before) throw notFound('Sponsor not found')
    const state = stateFor(b, before.state)
    const s = await one(
      `update home_sponsors
          set sponsor = $2, title = $3, tagline = $4, cta = $5, click_url = $6, active = $7,
              starts_at = $8, ends_at = $9, position = $10, state = $11, updated_at = now()
        where id = $1 returning ${withLive}`,
      [req.params.id, b.sponsor, b.title, b.tagline, b.cta, b.clickUrl, state === 'published', b.startsAt, b.endsAt, b.position, state]
    )
    if (!s) throw notFound('Sponsor not found')
    await recordStaffAction(req, { action: 'UPDATED_SPONSOR', entityType: 'home_sponsor', entityId: s.id, summary: `updated homepage sponsor "${s.sponsor}"${s.state === 'published' ? '' : ` (${s.state})`}` })
    res.json({ sponsor: adminSponsor(s) })
  })
)

/** Publish a draft (now or on its start date), pause, resume or end a banner. */
const SPONSOR_ACTIONS = {
  publish: { from: ['draft'], to: 'published', verb: 'published' },
  pause: { from: ['published'], to: 'paused', verb: 'paused' },
  resume: { from: ['paused'], to: 'published', verb: 'resumed' },
  end: { from: ['draft', 'published', 'paused'], to: 'ended', verb: 'ended' },
}

manage.post(
  '/:id/state',
  validate(z.object({ action: z.enum(['publish', 'pause', 'resume', 'end']) })),
  asyncHandler(async (req, res) => {
    if (!uuid.safeParse(req.params.id).success) throw notFound('Sponsor not found')
    const before = await one('select * from home_sponsors where id = $1', [req.params.id])
    if (!before) throw notFound('Sponsor not found')
    const step = SPONSOR_ACTIONS[req.body.action]
    if (!step.from.includes(before.state)) {
      throw conflict(`This banner is ${before.state} — it cannot be ${step.verb}`)
    }
    const s = await one(
      `update home_sponsors
          set state = $2, active = ($2 = 'published'),
              ended_at = case when $2 = 'ended' then now() else ended_at end,
              updated_at = now()
        where id = $1 returning ${withLive}`,
      [before.id, step.to]
    )
    await recordStaffAction(req, { action: 'UPDATED_SPONSOR', entityType: 'home_sponsor', entityId: s.id, summary: `${step.verb} homepage sponsor "${s.sponsor}"` })
    res.json({ sponsor: adminSponsor(s) })
  })
)

/** VIEW STATS: totals plus views and clicks per day for the last 30 days. */
manage.get(
  '/:id/stats',
  asyncHandler(async (req, res) => {
    if (!uuid.safeParse(req.params.id).success) throw notFound('Sponsor not found')
    const s = await one(`select ${withLive} from home_sponsors where id = $1`, [req.params.id])
    if (!s) throw notFound('Sponsor not found')
    const days = await many(
      `select to_char(d.day, 'YYYY-MM-DD') as day,
              coalesce(x.impressions, 0)::int as impressions,
              coalesce(x.clicks, 0)::int as clicks
         from generate_series((now() at time zone 'Africa/Dar_es_Salaam')::date - 29,
                              (now() at time zone 'Africa/Dar_es_Salaam')::date, interval '1 day') as d(day)
         left join home_sponsor_daily x on x.sponsor_id = $1 and x.day = d.day::date
        order by d.day`,
      [s.id]
    )
    res.json({ sponsor: adminSponsor(s), days })
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
