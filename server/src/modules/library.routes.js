import { Router } from 'express'
import { one, many, query } from '../db/pool.js'
import { asyncHandler, notFound } from '../lib/errors.js'
import { requireAuth } from '../middleware/auth.js'
import {
  continueWatching,
  myList,
  purchased,
  recentlyWatched,
  savedIds,
} from '../lib/libraryRows.js'

const router = Router()

/**
 * My Library — all four rows, in one request.
 *
 * Entitlements live in the database against the user id, so they survive logging
 * out, changing phone or clearing the browser. That is the client's "purchase
 * remains unlocked after logout/login" requirement, and it is why Purchased is
 * read from `purchases` and not from anything the browser holds.
 *
 * The client asked for Continue Watching, Purchased, My List and Recently
 * Watched. Four rows fetched separately is four requests every time the tab is
 * opened, on top of everything else the dashboard already asks for, against a
 * limiter of 120 a minute. They are four reads of two tables for one user, so
 * they are answered together.
 *
 * `videos` is kept, and is still exactly the Purchased list it always was.
 * Renaming it would have broken the Library tab and the purchase journey's
 * assertions for no gain; the new rows sit alongside it.
 */
router.get(
  '/',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const [bought, watching, list, recent] = await Promise.all([
      purchased(req.user.id),
      continueWatching(req.user.id),
      myList(req.user.id),
      recentlyWatched(req.user.id),
    ])

    res.json({
      videos: bought,
      purchased: bought,
      continueWatching: watching,
      myList: list,
      recentlyWatched: recent,
      /* So a grid of cards can draw the right Save state without a request per
         card — the same reasoning as GET /api/creators/following. */
      savedIds: list.map((v) => v.id),
    })
  })
)

/**
 * Continue Watching on its own, for the home page.
 *
 * Home wants one small row, not a whole library, and asking for the batched
 * response there would fetch a viewer's entire purchase history to draw four
 * tiles.
 */
router.get(
  '/continue',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const limit = Math.min(24, Math.max(1, Number(req.query.limit) || 12))
    res.json({ videos: await continueWatching(req.user.id, limit) })
  })
)

/* ----------------------------------------------------------------- My List */

router.get(
  '/saved',
  requireAuth(),
  asyncHandler(async (req, res) => {
    res.json({ videos: await myList(req.user.id), videoIds: await savedIds(req.user.id) })
  })
)

/**
 * Save a video. Idempotent — pressing Save twice is one row, not an error.
 *
 * The response says what the state IS rather than what changed, so an optimistic
 * button can settle on the truth instead of on its own arithmetic.
 */
router.post(
  '/saved/:videoId',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const video = await one('select id from videos where id = $1 and deleted_at is null', [
      req.params.videoId,
    ])
    if (!video) throw notFound('Video not found')
    await query(
      `insert into saved_videos (user_id, video_id) values ($1, $2)
       on conflict (user_id, video_id) do nothing`,
      [req.user.id, video.id]
    )
    res.json({ videoId: video.id, saved: true })
  })
)

/**
 * Unsave. Also idempotent, and deliberately does NOT check the video exists:
 * removing something from your own list must keep working after the video has
 * been deleted, which is the one moment you most want it gone.
 */
router.delete(
  '/saved/:videoId',
  requireAuth(),
  asyncHandler(async (req, res) => {
    await query('delete from saved_videos where user_id = $1 and video_id = $2', [
      req.user.id,
      req.params.videoId,
    ])
    res.json({ videoId: req.params.videoId, saved: false })
  })
)

/* --------------------------------------------------------------- history */

/**
 * Remove from history — hide the row, keep the position.
 *
 * Continue Watching and Recently Watched are the same table read two ways, so
 * this takes the video out of both. It does NOT delete the row: the commonest
 * reason to use this is wanting a title off a shared screen, not wanting to lose
 * your place in it. Reopening the film still resumes, and watching more of it
 * puts it back (see the progress write path).
 */
router.delete(
  '/history/:videoId',
  requireAuth(),
  asyncHandler(async (req, res) => {
    await query(
      `update watch_progress set hidden_at = now()
        where user_id = $1 and video_id = $2 and hidden_at is null`,
      [req.user.id, req.params.videoId]
    )
    res.json({ videoId: req.params.videoId, hidden: true })
  })
)

/** Purchase receipts, for the "My Purchases" screen. */
router.get(
  '/purchases',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const rows = await many(
      `select pu.*, v.title as video_title, v.slug, v.is_published,
              coalesce(cp.display_name, p.full_name) as creator_name,
              pay.method, pay.status as payment_status
         from purchases pu
         join videos v on v.id = pu.video_id
         join profiles p on p.id = v.creator_id
         left join creator_profiles cp on cp.user_id = v.creator_id
         left join payments pay on pay.id = pu.payment_id
        where pu.user_id = $1
        order by pu.purchased_at desc`,
      [req.user.id]
    )

    const stats = await one(
      `select count(*)::int as owned,
              coalesce(sum(amount_tzs),0)::int as spent
         from purchases where user_id = $1 and status = 'active'`,
      [req.user.id]
    )

    res.json({
      stats: { videosOwned: stats.owned, totalSpentTzs: stats.spent },
      purchases: rows.map((r) => ({
        id: r.id,
        videoId: r.video_id,
        videoTitle: r.video_title,
        videoSlug: r.slug,
        isPublished: r.is_published,
        creatorName: r.creator_name,
        amountTzs: r.amount_tzs,
        method: r.method,
        status: r.status,
        purchasedAt: r.purchased_at,
      })),
    })
  })
)

/** Does this account own a specific video? Used by the player on load. */
router.get(
  '/entitlement/:videoId',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const video = await one('select id, access_type from videos where id = $1 and deleted_at is null', [
      req.params.videoId,
    ])
    if (!video) throw notFound('Video not found')

    const purchase = await one(
      `select id, purchased_at from purchases
        where user_id = $1 and video_id = $2 and status = 'active'`,
      [req.user.id, video.id]
    )

    res.json({
      videoId: video.id,
      owned: Boolean(purchase),
      free: video.access_type === 'free_with_ads',
      purchasedAt: purchase?.purchased_at ?? null,
    })
  })
)

export default router
