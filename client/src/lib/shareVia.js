/**
 * The share link each button sends, tagged with where it went (`via=wa`).
 * WhatsApp sends no referrer and opens links in the phone's own browser, so
 * without the tag a buyer who came from a WhatsApp share is counted as
 * "direct". trafficSource.js reads `via`; the preview card is the same.
 */
export function viaUrl(shareUrl, via) {
  const u = String(shareUrl || '').trim()
  if (!u || !via) return u
  return `${u}${u.includes('?') ? '&' : '?'}via=${encodeURIComponent(via)}`
}
