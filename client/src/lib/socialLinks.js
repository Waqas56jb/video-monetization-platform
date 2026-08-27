/**
 * Turn a URL into the icon the public creator page should show next to it.
 */
export function socialIcon(url) {
  const u = String(url || '').toLowerCase()
  if (u.includes('instagram')) return 'instagram'
  if (u.includes('youtube') || u.includes('youtu.be')) return 'youtube'
  if (u.includes('facebook') || u.includes('fb.com')) return 'facebook'
  if (u.includes('tiktok')) return 'music-2'
  return 'link'
}

export function socialLabel(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    return host
  } catch {
    return String(url || '').replace(/^https?:\/\/(www\.)?/, '')
  }
}
