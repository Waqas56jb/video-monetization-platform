import { shareWatchUrl, canonicalWatchUrl } from '@/lib/watchUrl'

/** URLs for copy / WhatsApp / edge warm from API share payload. */
export function urlsFromShare(video, share, origin) {
  const slug = video?.slug || share?.slug
  const sourceKey = share?.sourceKey || video?.sourceKey || null
  const cleanUrl = share?.watchUrl || canonicalWatchUrl(video, origin)
  const shareUrl = share?.watchUrl
    ? sourceKey
      ? `${share.watchUrl}${share.watchUrl.includes('?') ? '&' : '?'}s=${encodeURIComponent(sourceKey)}`
      : share.watchUrl
    : shareWatchUrl(video, origin, sourceKey)
  const cardUrl = share?.cardUrl || null
  return { slug, sourceKey, cleanUrl, shareUrl, cardUrl }
}

export function shareMessageText(title, creator, shareUrl) {
  const lines = []
  if (title) lines.push(creator ? `${title} — ${creator}` : title)
  if (shareUrl) lines.push(shareUrl)
  return lines.join('\n')
}
