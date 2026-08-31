/**
 * Where a share card lives in the `share-cards` bucket.
 *
 * Three places name these objects: the uploader that writes them, the meta
 * helper that publishes a URL for one, and `client/api/og.js`, which reads one
 * on the WhatsApp poster path. They sat as three separate template literals in
 * three files, in two different deployables, and had already drifted apart in
 * what they pointed at. Nothing broke — the uploader happens to write both names
 * — but it is one edit away from breaking silently, and the symptom would be a
 * poster that WhatsApp quietly declines to show.
 *
 * So the shape is written once. This module deliberately imports nothing: it is
 * read by a client-side test that must not drag the server's env, database or
 * Supabase client into a browser package's test run.
 *
 * TWO OBJECTS PER CARD, and the difference matters:
 *
 *   {slug}.jpg               "latest", cacheControl 3600
 *   {slug}-{sourceKey}.jpg   immutable, cacheControl 31536000
 *
 * `sourceKey` is a hash of the poster, title and creator, so a new key means a
 * genuinely different card. The versioned object can therefore be cached for a
 * year and is always exactly the card its name claims. The latest object is the
 * one to read when no key is known, and it carries an hour of staleness after a
 * rebuild — which is why anything holding a sourceKey should prefer the
 * versioned name rather than the convenient one.
 */

export const SHARE_CARD_BUCKET = 'share-cards'

/** A sourceKey is a short hex digest. Anything else must not reach a path. */
const SOURCE_KEY_RE = /^[a-z0-9]{1,40}$/i

export function isValidSourceKey(sourceKey) {
  return SOURCE_KEY_RE.test(String(sourceKey || ''))
}

/** `{slug}.jpg` — overwritten on every rebuild, so cached for an hour only. */
export function latestCardPath(slug) {
  if (!slug) return null
  return `${slug}.jpg`
}

/** `{slug}-{sourceKey}.jpg` — one exact card, safe to cache for a year. */
export function versionedCardPath(slug, sourceKey) {
  if (!slug || !isValidSourceKey(sourceKey)) return null
  return `${slug}-${sourceKey}.jpg`
}

/**
 * The best path to READ for a card, given what the caller knows.
 *
 * A caller holding a sourceKey is holding the identity of one specific card and
 * should ask for that one by name; falling back to "latest" is only correct when
 * there is nothing better to go on.
 */
export function readCardPath(slug, sourceKey) {
  return versionedCardPath(slug, sourceKey) || latestCardPath(slug)
}

/** Both objects the uploader is responsible for writing, in write order. */
export function writeCardPaths(slug, sourceKey) {
  return {
    latest: latestCardPath(slug),
    versioned: versionedCardPath(slug, sourceKey),
  }
}
