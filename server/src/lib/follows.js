import { one, query } from '../db/pool.js'
import { badRequest, notFound } from './errors.js'

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isUuid(value) {
  return typeof value === 'string' && UUID.test(value)
}

/**
 * Follow / unfollow a public creator.
 *
 * The graph is `follows`. `creator_profiles.followers` is kept in step so the
 * admin creators list still has a number to show.
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
  const followers = Number(row?.followers || 0)
  await query(
    `update creator_profiles
        set followers = $2, updated_at = now()
      where user_id = $1`,
    [creatorId, followers]
  )
  return {
    isFollowing: Boolean(row?.is_following),
    followers,
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

export async function unfollowCreator(followerId, creatorId) {
  if (!isUuid(followerId) || !isUuid(creatorId)) throw notFound('Creator not found')
  await requireCreator(creatorId)
  await query(
    `delete from follows where follower_id = $1 and creator_id = $2`,
    [followerId, creatorId]
  )
  return snapshot(followerId, creatorId)
}
