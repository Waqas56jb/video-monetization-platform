import { ACCESS_SHORT, duration, tzs, compact, daysUntil } from '@/hooks/useApi'
import { mediaUrl } from '@/lib/api'
import { canonicalWatchPath } from '@/lib/watchUrl'

/**
 * Turn a video from the API into the shape the card component draws.
 *
 * One place, because the same video appears on the landing grid, in Explore,
 * in a library and in search results — and a price that reads one way in one
 * of those and another way elsewhere is how people end up confused about what
 * they are buying.
 */
export function toCard(v, { owned = false } = {}) {
  const premiereDays = daysUntil(v.premiereEndsAt)

  return {
    id: v.id,
    slug: v.slug,
    thumb: mediaUrl(v.thumbnailUrl),
    time: v.durationSeconds ? duration(v.durationSeconds) : null,
    title: v.title,
    author: v.creator?.name || null,
    avatar: v.creator?.avatarUrl || null,

    tag: owned
      ? v.isPublished === false
        ? { cls: 'tag-owned', label: 'STILL YOURS' }
        : { cls: 'tag-owned', label: 'IN LIBRARY' }
      : v.accessType === 'free_with_ads'
        ? { cls: 'tag-free', label: 'FREE + ADS' }
        : v.accessType === 'paid_premiere'
          ? { cls: 'tag-prem', label: premiereDays != null ? `${premiereDays} DAYS LEFT` : 'PAID PREMIERE' }
          : { cls: 'tag-ppv', label: 'PAY ONCE' },

    price: owned
      ? v.isPublished === false
        ? 'Still yours'
        : 'In library'
      : v.accessType === 'free_with_ads' ? 'Free' : tzs(v.priceTzs),
    priceNote: owned
      ? v.isPublished === false
        ? 'no longer listed — still yours'
        : 'in your library'
      : v.accessType === 'free_with_ads'
        ? 'ad supported'
        : v.accessType === 'paid_premiere'
          ? premiereDays != null
            ? `Free + Ads in ${premiereDays} days`
            : 'paid premiere'
          : 'stays in your library',
    priceColor: owned ? 'var(--green)' : v.accessType === 'free_with_ads' ? 'var(--green)' : undefined,

    views: `${compact(v.views)} views`,
    accessShort: ACCESS_SHORT[v.accessType] || v.accessType,
  }
}

/** In-app navigation. Public shares never use this UUID fallback. */
export const videoLink = (v) => canonicalWatchPath(v) || (v?.id ? `/watch/${v.id}` : '/explore')
