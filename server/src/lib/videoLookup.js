/**
 * Finding one video by id or slug, without defeating both indexes.
 *
 * `where v.id::text = $1 or v.slug = $1` looks harmless and is not. Casting the
 * primary key to text makes `videos_pkey` unusable, and the `OR` beside it stops
 * Postgres using the unique slug index either — so a lookup that should be a
 * single index probe becomes a sequential scan over every live row, growing with
 * the catalogue. Migration 027 says exactly this in its own header and fixed the
 * playback route; three call sites were missed and kept the pattern.
 *
 * The fix is to decide in JavaScript what kind of key we were given, and pass
 * `null` for the branch that does not apply. `$1::uuid is not null` is then a
 * constant the planner can fold away, leaving one index condition.
 *
 * Slug fallbacks come along because a stored slug may have been normalised since
 * a link was shared — see `videoKey.js`.
 */
import { slugFallbacks, isUuidKey } from './videoKey.js'

/**
 * Params for the predicate below: `[uuidOrNull, slugCandidates]`.
 *
 * A uuid key still populates the slug array — a slug that happens to look like
 * a uuid is legal, and matching either costs nothing once both sides are indexed.
 */
export function videoKeyParams(key) {
  const k = String(key || '').trim()
  return [isUuidKey(k) ? k : null, slugFallbacks(k)]
}

/**
 * The predicate itself, as a SQL fragment.
 *
 * `alias` is the table alias in the surrounding query. `offset` is how many
 * placeholders the caller has already used, so this can be appended to a query
 * that already binds `$1`.
 */
export function whereIdOrSlug(alias = 'v', offset = 0) {
  const a = `$${offset + 1}`
  const b = `$${offset + 2}`
  return `((${a}::uuid is not null and ${alias}.id = ${a}::uuid) or ${alias}.slug = any(${b}::text[]))`
}
