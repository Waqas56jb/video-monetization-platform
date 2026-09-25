/**
 * A page opened before a deploy asks for code chunks from the build it came
 * from. After the deploy those files are gone, the import fails, and the page
 * it was loading — Watch, most often — cannot render. One reload fetches the
 * current build and the navigation simply completes.
 *
 * Found in the final audit (2026-09-25): three "flaky" CI failures each landed
 * the minute a push went live, and a missing chunk hash on production answered
 * 200 text/html (the SPA fallback) instead of 404.
 */
const KEY = 'mtonyo.chunkReloadAt'
const QUIET_MS = 30_000

export function isChunkLoadError(err) {
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported|Failed to fetch|MIME type|ChunkLoadError/i.test(
    String(err?.message || err || '')
  )
}

/** Reload once; a second failure inside QUIET_MS is a real fault and is left to surface. */
export function reloadOnceForNewBuild() {
  if (typeof window === 'undefined') return false
  let last = 0
  try {
    last = Number(window.sessionStorage.getItem(KEY) || 0)
  } catch {
    /* storage refused — still allow the one reload */
  }
  if (Date.now() - last < QUIET_MS) return false
  try {
    window.sessionStorage.setItem(KEY, String(Date.now()))
  } catch {
    /* ignore */
  }
  window.location.reload()
  return true
}

export function withChunkReload(loader) {
  return () =>
    loader().catch((err) => {
      if (isChunkLoadError(err) && reloadOnceForNewBuild()) return new Promise(() => {})
      throw err
    })
}
