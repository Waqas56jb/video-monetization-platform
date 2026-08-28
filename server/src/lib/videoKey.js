/**
 * Keys a watch URL may still carry after we cleaned slugs.
 *
 * Old links were `title-demoxxxx` or `title-` plus five random characters.
 * Those suffixes are gone from `videos.slug`, but WhatsApp and copied URLs
 * still hold them. Trying the stripped form means an old share still opens
 * the film instead of "Video not found".
 */

/** True when the watch key is a videos.id, so Postgres can use the PK. */
export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuidKey(key) {
  return UUID_RE.test(String(key || '').trim())
}

export function slugFallbacks(key) {
  const k = String(key || '').trim()
  if (!k) return []
  const out = [k]
  const withoutDemo = k.replace(/-demo[a-z0-9]+$/i, '')
  if (withoutDemo && withoutDemo !== k) out.push(withoutDemo)
  const withoutRand = k.replace(/-[a-z0-9]{5}$/i, '')
  if (withoutRand && withoutRand !== k) out.push(withoutRand)
  return [...new Set(out)]
}
