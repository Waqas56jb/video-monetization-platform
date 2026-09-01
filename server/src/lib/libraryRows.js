import { many } from '../db/pool.js'
import { thumbnailFor } from '../services/entitlement.js'
import { env } from '../config/env.js'
import { publicWatchUrl } from './publicWatchUrl.js'

/**
 * The four rows of My Library, from one place.
 *
 * Purchased, Continue Watching, My List, Recently Watched. Three of them are
 * the same shape of question — "these videos, for this viewer, in this order" —
 * and writing the column list four times is how one of them ends up quietly
 * missing `preview_uid` and showing a page of blank posters, which is exactly
 * what happened to My Library once already.
 *
 * CONTINUE WATCHING AND RECENTLY WATCHED ARE THE SAME TABLE READ TWO WAYS.
 * Continue Watching is what you have not finished; Recently Watched is what you
 * touched most recently, finished or not. Deriving both from `watch_progress`
 * rather than from `video_views` is deliberate: `watch_progress` is already one
 * row per viewer per video with an `updated_at`, which is precisely "distinct
 * video, newest first". `video_views` is an event log and would need
 * de-duplicating on every read.
 */

/** Everything `thumbnailFor()` needs, plus what a card draws. */
const VIDEO_COLUMNS = `
  v.id, v.slug, v.title, v.description, v.category,
  v.thumbnail_url, v.custom_thumbnail_url, v.cloudflare_uid, v.preview_uid,
  v.is_published, v.review_status, v.deleted_at,
  v.duration_seconds, v.access_type, v.price_tzs, v.views, v.creator_id,
  coalesce(cp.display_name, p.full_name) as creator_name,
  p.avatar_url as creator_avatar`

const VIDEO_JOINS = `
  join profiles p on p.id = v.creator_id
  left join creator_profiles cp on cp.user_id = v.creator_id`

/**
 * A published video the viewer can still open.
 *
 * `is_published` is NOT part of this test. Somebody who bought a film keeps it
 * when it is unlisted — that is the "STILL YOURS" case the library already
 * draws — so filtering on it here would make a purchase disappear from the
 * shelf the moment a creator unpublished it. `deleted_at` is different: the
 * video is gone.
 */
const ALIVE = `v.deleted_at is null`

export function shapeVideo(r, extra = {}) {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    description: r.description,
    category: r.category,
    thumbnailUrl: thumbnailFor(r),
    durationSeconds: r.duration_seconds,
    accessType: r.access_type,
    priceTzs: r.price_tzs,
    views: r.views,
    creator: { id: r.creator_id, name: r.creator_name, avatarUrl: r.creator_avatar },
    watchUrl: publicWatchUrl(env.publicWebUrl, r.slug),
    isPublished: r.is_published,
    ...extra,
  }
}

/**
 * Still watching: a position on the clock, not at either end.
 *
 * The lower bound drops a video someone opened and left after a few seconds —
 * a row that says "continue watching" for something nobody actually started is
 * noise, and the shelf is small. The upper bound drops one they have finished:
 * 95 % of the running time is the end of a film for anybody who does not sit
 * through the credits. A video with no known duration keeps only the lower
 * bound, because there is nothing to be 95 % of.
 */
const STARTED_SECONDS = 15
const FINISHED_FRACTION = 0.95

export async function continueWatching(userId, limit = 12) {
  const rows = await many(
    `select ${VIDEO_COLUMNS}, wp.seconds, wp.updated_at
       from watch_progress wp
       join videos v on v.id = wp.video_id
       ${VIDEO_JOINS}
      where wp.user_id = $1
        and wp.hidden_at is null
        and ${ALIVE}
        and wp.seconds >= $3
        and (v.duration_seconds is null or wp.seconds < v.duration_seconds * ${FINISHED_FRACTION})
      order by wp.updated_at desc
      limit $2`,
    [userId, limit, STARTED_SECONDS]
  )
  return rows.map((r) =>
    shapeVideo(r, {
      resumeSeconds: Number(r.seconds) || 0,
      lastWatchedAt: r.updated_at,
      /* So a card can draw a progress bar without a second calculation, and
         without the client having to know the finished rule. */
      percentWatched: r.duration_seconds
        ? Math.min(100, Math.round((Number(r.seconds) / Number(r.duration_seconds)) * 100))
        : null,
    })
  )
}

/** Everything touched recently, finished or not. */
export async function recentlyWatched(userId, limit = 12) {
  const rows = await many(
    `select ${VIDEO_COLUMNS}, wp.seconds, wp.updated_at
       from watch_progress wp
       join videos v on v.id = wp.video_id
       ${VIDEO_JOINS}
      where wp.user_id = $1
        and wp.hidden_at is null
        and ${ALIVE}
      order by wp.updated_at desc
      limit $2`,
    [userId, limit]
  )
  return rows.map((r) =>
    shapeVideo(r, { resumeSeconds: Number(r.seconds) || 0, lastWatchedAt: r.updated_at })
  )
}

export async function myList(userId, limit = 48) {
  const rows = await many(
    `select ${VIDEO_COLUMNS}, sv.created_at as saved_at
       from saved_videos sv
       join videos v on v.id = sv.video_id
       ${VIDEO_JOINS}
      where sv.user_id = $1 and ${ALIVE}
      order by sv.created_at desc
      limit $2`,
    [userId, limit]
  )
  return rows.map((r) => shapeVideo(r, { savedAt: r.saved_at }))
}

export async function purchased(userId) {
  const rows = await many(
    `select ${VIDEO_COLUMNS},
            pu.id as purchase_id, pu.purchased_at, pu.amount_tzs,
            pay.method, pay.provider_ref
       from purchases pu
       join videos v on v.id = pu.video_id
       ${VIDEO_JOINS}
       left join payments pay on pay.id = pu.payment_id
      where pu.user_id = $1 and pu.status = 'active' and ${ALIVE}
      order by pu.purchased_at desc`,
    [userId]
  )
  return rows.map((r) =>
    shapeVideo(r, {
      purchase: {
        id: r.purchase_id,
        purchasedAt: r.purchased_at,
        amountTzs: r.amount_tzs,
        method: r.method,
        reference: r.provider_ref,
      },
    })
  )
}

/** Which of these videos this viewer has saved — one query, for a page of cards. */
export async function savedIds(userId) {
  const rows = await many('select video_id from saved_videos where user_id = $1', [userId])
  return rows.map((r) => r.video_id)
}
