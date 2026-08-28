const TTL_MS = 60_000
const cache = new Map()

export function invalidateProfileCache(userId = null) {
  if (userId == null || userId === '') {
    cache.clear()
    return
  }
  cache.delete(String(userId))
}

export function peekProfileCache(userId) {
  const hit = cache.get(String(userId))
  if (!hit) return null
  if (Date.now() - hit.at >= TTL_MS) {
    cache.delete(String(userId))
    return null
  }
  return hit.profile
}

/**
 * Load a profile row, cached 60s per userId.
 *
 * Role and status live on this row, so a block/suspend/role change must call
 * `invalidateProfileCache(userId)` or the cached status is served until TTL.
 */
export async function loadProfileCached(userId, loader) {
  const key = String(userId)
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.profile
  const profile = await loader(userId)
  if (profile) cache.set(key, { profile, at: Date.now() })
  return profile
}

export const PROFILE_CACHE_TTL_MS = TTL_MS
