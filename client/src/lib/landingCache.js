/**
 * Instant Home paint: last stats / trending JSON from this tab.
 *
 * Memory wins on the same visit (Home → Watch → Home). sessionStorage covers
 * a refresh in the same tab. A background refetch always follows.
 */
const mem = new Map()
const PREFIX = 'mtonyo.landing.v1.'

function sessionStore() {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

export function readLanding(key) {
  if (mem.has(key)) return mem.get(key)
  try {
    const raw = sessionStore()?.getItem(PREFIX + key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    mem.set(key, parsed)
    return parsed
  } catch {
    return null
  }
}

export function writeLanding(key, data) {
  if (data == null) return data
  mem.set(key, data)
  try {
    sessionStore()?.setItem(PREFIX + key, JSON.stringify(data))
  } catch {
    /* quota / private mode */
  }
  return data
}

export function landingFetcher(key, fetch) {
  return () => fetch().then((data) => writeLanding(key, data))
}

export const LANDING_KEYS = {
  stats: 'stats.platform',
  topCreators: 'stats.topCreators',
  /* trending1 is gone: Hero and Features take videos[0] from the same
     `trending8` payload Trending fetches, so Home makes one list request
     instead of two. Left out rather than deprecated — an unused key invites
     someone to use it again. */
  trending8: 'videos.trending.8',
}
