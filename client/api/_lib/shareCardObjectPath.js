/**
 * Where a share card lives in the `share-cards` bucket — reader's copy.
 *
 * DELIBERATE DUPLICATE of `server/src/lib/shareCardObjectPath.js`, kept
 * byte-for-byte identical in behaviour.
 *
 * The two files cannot be one file. This function is deployed as part of the
 * `client` Vercel project, whose build root is `client/` — an import reaching up
 * into `server/` is not in the build context and would fail at deploy time, not
 * in review. So the boundary is real and the copy is forced.
 *
 * What is NOT forced is the drift. `shareCardObjectPath.test.js` imports both
 * files and asserts they return the same path for the same input, so the two
 * can only disagree by someone editing one and deleting a failing test. That is
 * the guarantee this pair is for: three places name these objects — the uploader
 * that writes them, the meta helper that publishes a URL, and this reader — and
 * they had already drifted into naming different things.
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
