/**
 * How much speculative work may be in flight at once.
 *
 * Every card warmed itself when it scrolled into view, so opening Explore fired
 * one playback request per visible card — six, measured, before anyone tapped
 * anything. Warm, that is free and the tap costs nothing. Cold, they are simply
 * competing with the request the viewer is waiting for: in a traced cold
 * navigation they pushed `/api/videos` to 1442 ms and the tapped video's own
 * playback to 962 ms. The prefetch was never wrong. There was too much of it,
 * started for the wrong reason — a card being visible is not evidence that
 * anyone wants it.
 *
 * Kept in its own module with no imports so the rule can be tested by running
 * it. `prefetchWatch.js` reaches `@/lib/api`, and nothing that does can be
 * imported by `node --test`.
 *
 * Nothing here aborts. That is deliberate rather than lazy: `dedupedGet` in
 * lib/api.js refuses to de-duplicate any request carrying an AbortSignal —
 *
 *     if (opts.body !== undefined || opts.signal) return request(...)
 *
 * — so making these abortable would switch off the in-flight collapsing that
 * currently merges a warm and the page's own fetch into a single request. The
 * cure would manufacture the duplicate fetch it was meant to prevent. Letting
 * at most two unwanted requests finish is the far smaller cost.
 */
export const MAX_INFLIGHT = 2

export function createWarmQueue(max = MAX_INFLIGHT) {
  const queued = []
  let running = 0

  function pump() {
    while (running < max && queued.length) {
      const job = queued.shift()
      if (job.cancelled) continue
      running += 1
      job.start().then(done, done)
    }
  }

  function done() {
    running -= 1
    pump()
  }

  return {
    /** Queue a job. `start` must return a promise. */
    push(key, start) {
      queued.push({ key: String(key), start, cancelled: false })
      pump()
    },

    /**
     * A navigation has begun — stop speculating.
     *
     * `keep` is the key being navigated to, and it is spared: it is no longer
     * speculative, it is what the page is about to await, and dropping it would
     * mean fetching it again a moment later.
     */
    drop(keep = null) {
      const key = keep == null ? null : String(keep)
      const spared = queued.filter((j) => j.key === key && !j.cancelled)
      for (const job of queued) if (job.key !== key) job.cancelled = true
      queued.length = 0
      queued.push(...spared)
      pump()
    },

    /** For tests and diagnostics. */
    stats: () => ({ running, waiting: queued.length }),
  }
}
