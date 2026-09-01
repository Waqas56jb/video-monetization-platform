import { many, one, query } from '../db/pool.js'
import { badRequest, notFound } from './errors.js'

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUuid(value) {
  return typeof value === 'string' && UUID.test(value)
}

/**
 * Follow / unfollow a public creator.
 *
 * The graph is `follows`. `creator_profiles.followers` mirrors it, and since
 * migration 031 the database owns that mirror — a trigger recounts it on every
 * insert, update and delete, including the cascaded deletes that used to leave
 * a creator holding an inflated number for followers whose accounts were gone.
 * Nothing in this file writes the integer any more.
 */

async function requireCreator(creatorId) {
  const row = await one(
    `select p.id
       from profiles p
       join creator_profiles cp on cp.user_id = p.id
      where p.id = $1 and p.status <> 'blocked'`,
    [creatorId]
  )
  if (!row) throw notFound('Creator not found')
  return row.id
}

async function snapshot(followerId, creatorId) {
  const row = await one(
    `select
       (select count(*)::int from follows where creator_id = $1) as followers,
       exists(
         select 1 from follows where follower_id = $2 and creator_id = $1
       ) as is_following`,
    [creatorId, followerId]
  )
  return {
    isFollowing: Boolean(row?.is_following),
    followers: Number(row?.followers || 0),
  }
}

export async function followCreator(followerId, creatorId) {
  if (!isUuid(followerId) || !isUuid(creatorId)) throw notFound('Creator not found')
  if (followerId === creatorId) throw badRequest('You cannot follow your own page')
  await requireCreator(creatorId)
  await query(
    `insert into follows (follower_id, creator_id)
     values ($1, $2)
     on conflict (follower_id, creator_id) do nothing`,
    [followerId, creatorId]
  )
  return snapshot(followerId, creatorId)
}

/**
 * Unfollowing does NOT go through `requireCreator`.
 *
 * It used to, and `requireCreator` filters `status <> 'blocked'` — so the moment
 * an administrator blocked a creator, every one of their followers got a 404
 * from this route and stayed counted for ever, with a Following button they
 * could not turn off. Blocking a creator is precisely when a viewer is most
 * likely to want out.
 *
 * There is nothing to guard against. Deleting a row that is not there is a
 * no-op, the delete is keyed on the caller's own id so it can only ever remove
 * their own follow, and a non-existent creator id simply matches nothing. The
 * check was buying no safety and costing the one case that mattered.
 */
export async function unfollowCreator(followerId, creatorId) {
  if (!isUuid(followerId) || !isUuid(creatorId)) throw notFound('Creator not found')
  await query(
    `delete from follows where follower_id = $1 and creator_id = $2`,
    [followerId, creatorId]
  )
  return snapshot(followerId, creatorId)
}

/**
 * Every creator this viewer follows, as ids.
 *
 * One request, so a page full of cards can each show the right Follow state
 * without asking per card. Ids only — the cards already have the creator's name
 * and avatar from the video payload, and sending profiles here would be paying
 * for data twice.
 */
export async function followingIds(followerId) {
  if (!isUuid(followerId)) return []
  const rows = await many(
    `select creator_id from follows where follower_id = $1`,
    [followerId]
  )
  return rows.map((r) => r.creator_id)
}
