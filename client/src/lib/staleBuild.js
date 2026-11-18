/**
 * A tab left open across a deploy keeps running the code it loaded.
 *
 * Found 2026-11-18: the login fix for "Enter your email and password" with
 * both boxes filled (4e14f13) was live on the 16th, and the client still hit
 * the old bug on the 18th. Login ships in the main bundle, and an iPad keeps a
 * Safari tab alive for days; nothing in a single-page app reloads it. The
 * service worker only takes over on the next real page load.
 *
 * So the deploy publishes /build.json, and an open tab compares it with the id
 * baked into its own bundle whenever it comes back into view, gains focus or
 * changes page. Out of date means: reload now if the page holds nothing to
 * lose (sign-in and account screens, the homepage), otherwise reload into the
 * next page the person opens — a full load of the URL they were going to
 * anyway, never a reload under someone mid-video.
 */
import { reloadOnceForNewBuild } from './chunkReload.js'

const CHECK_EVERY_MS = 60_000

/** Pages where an immediate reload cannot lose anything the person typed or watched. */
export const SAFE_TO_RELOAD = /^\/(login|signup|forgot-password|reset(-password)?)?\/?$/

export function isStale(latestId, ownId) {
  return Boolean(latestId) && Boolean(ownId) && latestId !== ownId
}

export function createStaleBuildWatch({
  ownId,
  fetchImpl = typeof fetch === 'function' ? fetch : null,
  now = () => Date.now(),
  /* At most one automatic reload per 30s (chunkReload's guard), so a CDN
     serving an old page beside a new build.json can never loop. */
  reload = () => reloadOnceForNewBuild(),
  path = () => window.location.pathname,
} = {}) {
  let stale = false
  let lastCheck = -Infinity
  let inflight = null

  async function check({ force = false } = {}) {
    if (stale || !fetchImpl || !ownId) return stale
    if (!force && now() - lastCheck < CHECK_EVERY_MS) return stale
    if (inflight) return inflight
    lastCheck = now()
    inflight = fetchImpl(`/build.json?t=${now()}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        stale = isStale(j?.id, ownId)
        return stale
      })
      .catch(() => stale)
      .finally(() => {
        inflight = null
      })
    return inflight
  }

  /** Coming back to the tab: check, and reload at once where that is safe. */
  async function onReturn() {
    if ((await check()) && SAFE_TO_RELOAD.test(path())) reload()
  }

  /** The person moved to another page: if this build is old, load the new one there. */
  function onNavigate() {
    if (stale) {
      reload()
      return true
    }
    check().then((s) => {
      if (s && SAFE_TO_RELOAD.test(path())) reload()
    })
    return false
  }

  return { check, onReturn, onNavigate, isStale: () => stale }
}

let watch = null

/** Production only: wire the checks to the page. Safe to call once. */
export function startStaleBuildWatch(ownId) {
  if (watch || typeof window === 'undefined') return watch
  watch = createStaleBuildWatch({ ownId })
  const back = () => {
    if (document.visibilityState === 'visible') watch.onReturn()
  }
  document.addEventListener('visibilitychange', back)
  window.addEventListener('focus', back)
  window.addEventListener('pageshow', (e) => {
    // Restored from Safari's back/forward cache: the old JS woke up as it was.
    if (e.persisted) watch.check({ force: true }).then((s) => s && watch.onReturn())
  })
  watch.check({ force: true }).then((s) => {
    if (s && SAFE_TO_RELOAD.test(window.location.pathname)) reloadOnceForNewBuild()
  })
  return watch
}

export const staleBuildWatch = () => watch
