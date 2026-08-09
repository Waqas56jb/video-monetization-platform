import { ACCESS_SHORT, duration, tzs, compact, daysUntil } from '@/hooks/useApi'

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
    thumb: v.thumbnailUrl,
    time: v.durationSeconds ? duration(v.durationSeconds) : null,
    title: v.title,
    author: v.creator?.name || null,
    avatar: v.creator?.avatarUrl || null,

    tag: owned
      ? { cls: 'owned', label: 'OWNED' }
      : v.accessType === 'free_with_ads'
        ? { cls: 'free', label: 'FREE WITH ADS' }
        : v.accessType === 'paid_premiere'
          ? { cls: 'premiere', label: premiereDays != null ? `${premiereDays} DAYS LEFT` : 'PAID PREMIERE' }
          : { cls: 'ppv', label: 'PAY ONCE' },

    price: owned ? 'Owned' : v.accessType === 'free_with_ads' ? 'Free' : tzs(v.priceTzs),
    priceNote: owned
      ? 'yours forever'
      : v.accessType === 'free_with_ads'
        ? 'ad supported'
        : v.accessType === 'paid_premiere'
          ? premiereDays != null
            ? `free with ads in ${premiereDays} days`
            : 'paid premiere'
          : 'keep it forever',
    priceColor: owned ? 'var(--green)' : v.accessType === 'free_with_ads' ? 'var(--green)' : undefined,

    views: `${compact(v.views)} views`,
    accessShort: ACCESS_SHORT[v.accessType] || v.accessType,
  }
}

/** Where a video lives. Slug when it has one, so the URL reads as something. */
export const videoLink = (v) => `/watch/${v?.slug || v?.id || ''}`
