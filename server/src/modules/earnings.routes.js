import { Router } from 'express'
import { z } from 'zod'
import { one, many, transaction } from '../db/pool.js'
import { asyncHandler, badRequest, conflict, notFound } from '../lib/errors.js'
import { validate } from '../middleware/validate.js'
import { requireAuth, requireCreator } from '../middleware/auth.js'
import { getSettings, splitPercentFor } from '../services/settings.js'
import { recordAudit, clientIp } from '../services/audit.js'

const router = Router()

/**
 * Last N calendar days, including zeros.
 *
 * The query only returns days that had a row, so a creator whose advertising
 * all landed on one day got a one-point series the chart refused to draw —
 * and the overview then said they had no earnings, next to a non-zero balance.
 * Filling the gaps makes a single day's ads visible as a spike.
 */
function fillDaily(rows, days = 30) {
  const by = new Map()
  for (const r of rows) {
    const key = new Date(r.day).toISOString().slice(0, 10)
    by.set(key, r)
  }
  const out = []
  const origin = new Date()
  origin.setUTCHours(12, 0, 0, 0)
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(origin)
    d.setUTCDate(d.getUTCDate() - i)
    const key = d.toISOString().slice(0, 10)
    const r = by.get(key)
    out.push({
      day: key,
      amountTzs: Number(r?.amount || 0),
      salesTzs: Number(r?.sales || 0),
      adsTzs: Number(r?.ads || 0),
    })
  }
  return out
}

/** Money a creator has earned, is owed, and has already been paid. */
async function balanceFor(creatorId) {
  const totals = await one(
    `select coalesce(sum(creator_tzs),0)::int  as lifetime,
            coalesce(sum(case when source = 'sale' then creator_tzs else 0 end),0)::int as from_sales,
            coalesce(sum(case when source = 'ad'   then creator_tzs else 0 end),0)::int as from_ads,
            coalesce(sum(platform_tzs),0)::int as platform_share
       from earnings where creator_id = $1`,
    [creatorId]
  )
  const paidOut = await one(
    `select coalesce(sum(amount_tzs),0)::int as paid,
            coalesce(sum(case when status = 'pending' then amount_tzs else 0 end),0)::int as pending
       from withdrawals where creator_id = $1 and status in ('paid','pending')`,
    [creatorId]
  )
  const available = totals.lifetime - paidOut.paid - paidOut.pending
  return {
    lifetimeTzs: totals.lifetime,
    fromSalesTzs: totals.from_sales,
    fromAdsTzs: totals.from_ads,
    platformShareTzs: totals.platform_share,
    paidOutTzs: paidOut.paid,
    pendingWithdrawalTzs: paidOut.pending,
    availableTzs: Math.max(0, available),
  }
}

/* -------------------------------------------------------- creator summary */
router.get(
  '/',
  requireAuth(),
  requireCreator(),
  asyncHandler(async (req, res) => {
    const balance = await balanceFor(req.user.id)
    const splitPercent = await splitPercentFor(req.user.id)

    const stats = await one(
      `select coalesce(sum(v.views),0)::int as total_views,
              coalesce(sum(v.paid_unlocks),0)::int as paid_unlocks,
              count(*) filter (where v.is_published)::int as published
         from videos v where v.creator_id = $1 and v.deleted_at is null`,
      [req.user.id]
    )

    const daily = await many(
      // Split by source so the chart can show sales and advertising apart from
      // one another — a creator whose premiere has expired needs to see the
      // handover from one to the other, not a single blended line.
      `select date_trunc('day', created_at)::date as day,
              coalesce(sum(creator_tzs),0)::int as amount,
              coalesce(sum(case when source = 'sale' then creator_tzs else 0 end),0)::int as sales,
              coalesce(sum(case when source = 'ad'   then creator_tzs else 0 end),0)::int as ads
         from earnings
        where creator_id = $1 and created_at > now() - interval '30 days'
        group by 1 order by 1`,
      [req.user.id]
    )

    /* What the advertising side of the business is actually doing. */
    const adStats = await one(
      `select count(*)::int                                    as impressions,
              count(*) filter (where completed)::int            as completed,
              count(distinct video_id)::int                     as videos,
              (select count(*)::int from videos
                where creator_id = $1 and deleted_at is null
                  and is_published and ads_enabled
                  and access_type = 'free_with_ads')            as videos_carrying_ads
         from ad_impressions where creator_id = $1`,
      [req.user.id]
    )

    res.json({
      balance,
      splitPercent,
      stats: {
        totalViews: stats.total_views,
        paidUnlocks: stats.paid_unlocks,
        publishedVideos: stats.published,
      },
      ads: {
        impressions: adStats.impressions,
        completed: adStats.completed,
        videosWithImpressions: adStats.videos,
        videosCarryingAds: adStats.videos_carrying_ads,
        earnedTzs: balance.fromAdsTzs,
      },
      daily: fillDaily(daily),
    })
  })
)

/* ------------------------------------------------------------ transactions */
router.get(
  '/transactions',
  requireAuth(),
  requireCreator(),
  asyncHandler(async (req, res) => {
    const rows = await many(
      `select e.*, v.title as video_title
         from earnings e
         left join videos v on v.id = e.video_id
        where e.creator_id = $1
        order by e.created_at desc limit 200`,
      [req.user.id]
    )
    res.json({
      transactions: rows.map((r) => ({
        id: r.id,
        source: r.source,
        videoId: r.video_id,
        videoTitle: r.video_title,
        grossTzs: r.gross_tzs,
        creatorTzs: r.creator_tzs,
        platformTzs: r.platform_tzs,
        splitPercent: r.split_percent,
        createdAt: r.created_at,
      })),
    })
  })
)

/* ------------------------------------------------------------ withdrawals */
router.get(
  '/withdrawals',
  requireAuth(),
  requireCreator(),
  asyncHandler(async (req, res) => {
    const rows = await many(
      `select * from withdrawals where creator_id = $1 order by requested_at desc`,
      [req.user.id]
    )
    res.json({ withdrawals: rows, balance: await balanceFor(req.user.id) })
  })
)

const withdrawSchema = z.object({
  amountTzs: z.coerce.number().int().min(1, 'Enter an amount'),
  method: z.enum(['mpesa', 'airtel']),
  phone: z.string().trim().regex(/^[0-9+\s-]{9,15}$/, 'Enter a valid mobile money number'),
})

/** V1 payouts are manual: this queues a request an admin marks as paid. */
router.post(
  '/withdrawals',
  requireAuth(),
  requireCreator(),
  validate(withdrawSchema),
  asyncHandler(async (req, res) => {
    const { amountTzs, method, phone } = req.body
    const settings = await getSettings()

    if (amountTzs < settings.min_withdrawal_tzs) {
      throw badRequest(
        `The minimum withdrawal is TZS ${settings.min_withdrawal_tzs.toLocaleString()}`
      )
    }

    const withdrawal = await transaction(async (client) => {
      /**
       * Serialise every withdrawal request for this creator.
       *
       * Recomputing inside the transaction was not enough on its own. Postgres
       * reads at READ COMMITTED by default, so two requests arriving together
       * both saw the same balance, both found it sufficient, and both inserted
       * — a creator with 50,000 available could withdraw it twice by
       * double-tapping. Neither row is wrong on its own, which is what makes it
       * hard to spot afterwards.
       *
       * The lock is held to the end of the transaction and is scoped to this
       * creator, so nobody else's request waits on it.
       */
      await client.query('select pg_advisory_xact_lock(hashtext($1))', [
        `withdrawal:${req.user.id}`,
      ])

      const { rows: earn } = await client.query(
        `select coalesce(sum(creator_tzs),0)::int as lifetime from earnings where creator_id = $1`,
        [req.user.id]
      )
      const { rows: out } = await client.query(
        `select coalesce(sum(amount_tzs),0)::int as taken from withdrawals
          where creator_id = $1 and status in ('paid','pending')`,
        [req.user.id]
      )
      const available = earn[0].lifetime - out[0].taken
      if (amountTzs > available) {
        throw badRequest(`You can withdraw up to TZS ${available.toLocaleString()} right now`)
      }
      const { rows } = await client.query(
        `insert into withdrawals (creator_id, amount_tzs, method, phone)
         values ($1,$2,$3,$4) returning *`,
        [req.user.id, amountTzs, method, phone]
      )
      return rows[0]
    })

    await recordAudit({
      actorId: req.user.id,
      action: 'REQUESTED_WITHDRAWAL',
      entityType: 'withdrawal',
      entityId: withdrawal.id,
      detail: { amountTzs, method },
      ip: clientIp(req),
    })

    res.status(201).json({
      withdrawal,
      balance: await balanceFor(req.user.id),
      message: 'Withdrawal requested — payouts are processed within 24 hours',
    })
  })
)

router.delete(
  '/withdrawals/:id',
  requireAuth(),
  requireCreator(),
  asyncHandler(async (req, res) => {
    const w = await one('select * from withdrawals where id = $1', [req.params.id])
    if (!w) throw notFound('Withdrawal not found')
    if (w.creator_id !== req.user.id) throw notFound('Withdrawal not found')
    if (w.status !== 'pending') throw conflict('Only a pending withdrawal can be cancelled')

    await one(`delete from withdrawals where id = $1 returning id`, [w.id])
    res.json({ ok: true, balance: await balanceFor(req.user.id) })
  })
)

export default router
export { balanceFor }
