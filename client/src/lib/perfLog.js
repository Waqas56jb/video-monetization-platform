const PREFIX = 'mtonyo.perf.'
const FLAG = 'mtonyo.perf.enabled'

/** Dev always logs. Production only with `?perf=1` (sticky for the tab). */
export function perfEnabled() {
  if (typeof window === 'undefined') return false
  try {
    const q = new URLSearchParams(window.location.search)
    if (q.get('perf') === '1') {
      sessionStorage.setItem(FLAG, '1')
      return true
    }
    if (q.get('perf') === '0') {
      sessionStorage.removeItem(FLAG)
      return false
    }
    if (sessionStorage.getItem(FLAG) === '1') return true
  } catch {
    /* private mode */
  }
  return Boolean(import.meta.env.DEV)
}

export function markPerf(name) {
  if (!perfEnabled()) return
  try {
    sessionStorage.setItem(PREFIX + name, String(performance.now()))
  } catch {
    /* ignore */
  }
}

/**
 * Read a mark, report against it, and consume it.
 *
 * The consuming is the point. Marks used to be left behind, so one autoplay
 * refusal early in a session left `playClick` in session storage for good and
 * every later video reported a "play-to-first-frame" measured from a timestamp
 * belonging to a different video, minutes earlier. A measurement that can be
 * silently wrong about which event it timed is worse than no measurement.
 */
export function measurePerf(name, label) {
  if (!perfEnabled()) return
  try {
    const t = Number(sessionStorage.getItem(PREFIX + name) || '')
    if (!t) return
    sessionStorage.removeItem(PREFIX + name)
    console.info(`[mtonyo] ${label}: ${Math.round(performance.now() - t)}ms`)
  } catch {
    /* ignore */
  }
}

export function logPerf(label, ms) {
  if (!perfEnabled()) return
  console.info(`[mtonyo] ${label}: ${Math.round(ms)}ms`)
}
