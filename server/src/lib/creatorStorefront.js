import { many, one } from '../db/pool.js'
import { publicVideo } from '../services/entitlement.js'

/**
 * The public creator page: who they are, and how their catalogue is arranged.
 *
 * Watch used to link to a name. This is the storefront behind that name —
 * avatar, verification, location, category, bio, socials, counts, then the
 * catalogue split the way a viewer actually browses it: featured, latest,
 * most watched, everything live.
 */

const CATALOGUE = `
  select v.*, p.full_name as creator_name, p.avatar_url as creator_avatar,
         cp.display_name as creator_display, coalesce(cp.verified, false) as creator_verified
    from videos v
    join profiles p on p.id = v.creator_id
    left join creator_profiles cp on cp.user_id = v.creator_id
   where v.creator_id = $1
     and v.is_published = true
     and v.review_status = 'approved'
     and v.deleted_at is null`

function asPublic(row) {
  return publicVideo({
    ...row,
    creator_name: row.creator_display || row.creator_name,
  })
}

export async function creatorStorefront(creatorId) {
  const row = await one(
    `select p.id, p.full_name, p.avatar_url, p.website,
            cp.display_name, cp.bio, cp.location, cp.verified, cp.followers,
            cp.category, cp.socials
       from profiles p
       join creator_profiles cp on cp.user_id = p.id
      where p.id = $1 and p.status <> 'blocked'`,
    [creatorId]
  )
  if (!row) return null

  const published = await many(
    `${CATALOGUE} order by v.published_at desc nulls last, v.created_at desc`,
    [creatorId]
  )
  const videos = published.map(asPublic)
  const totalViews = published.reduce((n, v) => n + Number(v.views || 0), 0)

  const featuredRow =
    published.find((v) => v.featured) || published[0] || null
  const featured = featuredRow ? asPublic(featuredRow) : null

  const latest = videos.slice(0, 8)
  const mostWatched = [...videos]
    .sort((a, b) => Number(b.views || 0) - Number(a.views || 0))
    .slice(0, 8)

  const socials = Array.isArray(row.socials) ? row.socials.filter(Boolean) : []
  if (row.website && !socials.includes(row.website)) socials.push(row.website)

  return {
    id: row.id,
    name: row.display_name || row.full_name,
    avatarUrl: row.avatar_url,
    bio: row.bio || '',
    location: row.location || '',
    verified: Boolean(row.verified),
    followers: Number(row.followers || 0),
    category: row.category || '',
    socials,
    videoCount: videos.length,
    totalViews,
    featured,
    latest,
    mostWatched,
    videos,
  }
}
