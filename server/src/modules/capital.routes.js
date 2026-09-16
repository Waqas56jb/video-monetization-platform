import { Router } from 'express'
import { z } from 'zod'
import { one, many } from '../db/pool.js'
import { asyncHandler, badRequest, conflict } from '../lib/errors.js'
import { validate } from '../middleware/validate.js'
import { requireAuth, requireCreator } from '../middleware/auth.js'
import { getSettings } from '../services/settings.js'
import { notifyAdminsOfStaffAction } from '../services/notify.js'

const router = Router()

/**
 * Creator Capital — the creator-facing half.
 *
 * Manual workflow only. This route never disburses anything and never makes
 * a credit decision — it records eligibility, a request to be reviewed, and
 * whatever an admin (standing in for AirPay) later decides. See
 * 037_creator_capital.sql and 040_capital_global_months_and_consent.sql for
 * why the table looks the way it does.
 */
router.use(requireAuth(), requireCreator())

/**
 * Statuses that mean "this creator has a live Creator Capital record" — the
 * same list migration 040's `creator_capital_one_live` index is built on.
 * `repaid` and `declined` are terminal: a creator can ask again after either.
 */
const LIVE_STATUSES = ['building', 'under_review', 'approved', 'active', 'paused']

/**
 * The platform's ONE eligibility rule — `platform_settings.
 * capital_months_required`, set in Super Admin → Settings (migration 040).
 * Not the row's own `months_required`, which is only a record of what the
 * rule was when that request was made: reading the rule from rows is how
 * the homepage said 6 while Super Admin said "3 of 2".
 */
async function requiredMonths() {
  const settings = await getSettings()
  return Number(settings?.capital_months_required) || 6
}

/**
 * Months of verified earnings, and the lifetime/recent totals the eligibility
 * check and the "X of N months" progress bar both need.
 *
 * "Verified" means settled, ledger-recorded money — `earnings`, which is
 * only ever written inside the settlement transaction (payments.service.js,
 * ads.js's recordImpression) — not raw video views or unconfirmed activity.
 * "N months" means N distinct calendar months with at least one earning row,
 * not necessarily consecutive: a quiet month should not reset progress on
 * money the creator has already, genuinely, earned.
 */
async function eligibilityFor(creatorId) {
  return one(
    `select count(distinct date_trunc('month', e.created_at))::int as months_with_earnings,
            coalesce(sum(e.creator_tzs), 0)::int                   as lifetime_creator_tzs,
            coalesce(sum(e.creator_tzs) filter (
              where e.created_at >= now() - interval '90 days'
            ), 0)::int                                             as recent_90d_creator_tzs
       from earnings e
      where e.creator_id = $1`,
    [creatorId]
  )
}

function shapeCapital(row) {
  if (!row) return null
  return {
    id: row.id,
    status: row.status,
    monthsRequired: row.months_required,
    approvedAmountTzs: row.approved_amount_tzs,
    purpose: row.purpose,
    repaymentTerms: row.repayment_terms,
    amountRepaidTzs: row.amount_repaid_tzs,
    remainingBalanceTzs: row.remaining_balance_tzs,
    nextReviewAt: row.next_review_at,
    // admin_notes is deliberately not exposed here — it is the review's own
    // working notes, not a message written to the creator. A decline still
    // needs a reason; that belongs in `purpose`/`repaymentTerms` or a
    // notification body, not this internal field.
    consentAt: row.consent_at,
    requestedAt: row.requested_at,
    decidedAt: row.decided_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * The creator's current record: the live one if there is one, otherwise the
 * most recent closed one. Explicitly ordered — an unordered `limit 1` over a
 * creator who had a leftover `building` row beside a real `under_review` one
 * returned whichever Postgres felt like, and the dashboard then showed
 * "Request AirPay Review" again on top of a request already pending.
 */
async function currentRecord(creatorId) {
  return one(
    `select * from creator_capital
      where creator_id = $1
      order by (status = any($2::creator_capital_status[])) desc, created_at desc
      limit 1`,
    [creatorId, LIVE_STATUSES]
  )
}

/**
 * GET /api/capital/status — the creator's own row, or a synthesized
 * "building" view if they don't have one yet. No row is created until they
 * explicitly request review, mirroring how a creator_applications row only
 * exists once someone actually applies.
 */
router.get(
  '/status',
  asyncHandler(async (req, res) => {
    const [row, eligibility, monthsRequired] = await Promise.all([
      currentRecord(req.user.id),
      eligibilityFor(req.user.id),
      requiredMonths(),
    ])
    res.json({
      capital: shapeCapital(row),
      monthsWithEarnings: eligibility.months_with_earnings,
      monthsRequired,
      lifetimeCreatorTzs: eligibility.lifetime_creator_tzs,
      recent90dCreatorTzs: eligibility.recent_90d_creator_tzs,
    })
  })
)

const CONSENT_MESSAGE =
  'You need to consent to MTONYO+ sharing your verified earnings and account data with AirPay Microfinance before requesting a review'

/**
 * POST /api/capital/request-review — a creator asks to be considered.
 *
 * Three refusals, in order, each re-derived here rather than trusted from
 * whatever the client last fetched:
 *   - no consent to share verified earnings/account data with AirPay;
 *   - an open request already exists (mirrored by migration 040's
 *     `creator_capital_one_live` index, checked here first for a message that
 *     names the reason rather than a raw constraint violation);
 *   - under the platform's months-required rule.
 * A leftover `building` row becomes this request rather than sitting beside
 * it — that "beside it" is exactly the duplicate the client hit.
 */
router.post(
  '/request-review',
  validate(z.object({ consent: z.boolean().refine((v) => v === true, { message: CONSENT_MESSAGE }) })),
  asyncHandler(async (req, res) => {
    const existing = await one(
      `select id, status from creator_capital
        where creator_id = $1 and status in ('under_review', 'approved', 'active', 'paused')`,
      [req.user.id]
    )
    if (existing) throw conflict('You already have an open Creator Capital request')

    const monthsRequired = await requiredMonths()
    const eligibility = await eligibilityFor(req.user.id)
    if (eligibility.months_with_earnings < monthsRequired) {
      throw badRequest(
        `You need ${monthsRequired - eligibility.months_with_earnings} more month(s) of verified earnings before requesting a review`
      )
    }

    let row = await one(
      `update creator_capital
          set status = 'under_review', months_required = $2, requested_at = now(),
              consent_at = now(), updated_at = now()
        where creator_id = $1 and status = 'building'
      returning *`,
      [req.user.id, monthsRequired]
    )
    if (!row) {
      row = await one(
        `insert into creator_capital (creator_id, status, months_required, requested_at, consent_at)
           values ($1, 'under_review', $2, now(), now())
         on conflict (creator_id) where status in ('building','under_review','approved','active','paused')
           do nothing
         returning *`,
        [req.user.id, monthsRequired]
      )
    }
    if (!row) throw conflict('You already have an open Creator Capital request')

    await notifyAdminsOfStaffAction({
      actor: req.user,
      action: 'capital_request',
      title: 'Creator Capital review requested',
      body: `${req.user.full_name || req.user.email} asked to be reviewed by AirPay and consented to their verified earnings being shared.`,
      entityType: 'creator_capital',
      entityId: row.id,
    }).catch(() => {})

    res.json({ capital: shapeCapital(row) })
  })
)

/**
 * POST /api/capital/accept-offer — the creator's half of Approve → Publish
 * Offer → creator accepts → Active. An offer that is never accepted stays
 * `approved` rather than starting to draw down on its own.
 */
router.post(
  '/accept-offer',
  asyncHandler(async (req, res) => {
    const row = await one(
      `update creator_capital set status = 'active', updated_at = now()
        where creator_id = $1 and status = 'approved'
      returning *`,
      [req.user.id]
    )
    if (!row) throw badRequest('There is no published offer to accept')

    await notifyAdminsOfStaffAction({
      actor: req.user,
      action: 'capital_accept',
      title: 'A Creator Capital offer was accepted',
      body: `${req.user.full_name || req.user.email} accepted their published offer.`,
      entityType: 'creator_capital',
      entityId: row.id,
    }).catch(() => {})

    res.json({ capital: shapeCapital(row) })
  })
)

export default router
