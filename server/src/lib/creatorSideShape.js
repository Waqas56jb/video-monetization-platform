/**
 * Reduce a shaped creator object for the side that must not see it.
 *
 * A dual-role account's Watch side gets enough to know a Create side exists
 * (the switch UI needs a name to offer) and nothing else — not payout phone,
 * not the revenue split, not category/socials/bio/followers. `side` is
 * request-supplied and defaults to viewer: a request that never says which
 * side it is gets the narrower answer, not the wider one. Expects `creator`
 * already shaped to camelCase with at least a `displayName` field.
 */
export function creatorForSide(creator, side) {
  if (!creator) return null
  if (side === 'creator') return creator
  return { exists: true, displayName: creator.displayName }
}

export const sideFromQuery = (req) => (req.query.side === 'creator' ? 'creator' : 'viewer')
