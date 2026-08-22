/**
 * Where the video picks up once it has been paid for.
 *
 * The client's report was precise: after paying, the video restarted from the
 * beginning instead of continuing from where the preview stopped. The cause is
 * that the preview is a separate, shorter asset -- when it ends, or is paused
 * at the paywall, the player often reports currentTime back at 0. Trusting
 * that number alone is what produced a restart.
 *
 * So three sources are considered and the furthest honest one wins:
 *   - how far this session actually watched
 *   - what was remembered locally for this video
 *   - the preview's own stop point, when the preview is known to have run out
 *
 * That last clause is the fix. Kept here as a plain function because it is a
 * rule the client can read, and one that has to keep holding.
 */
export function resumePoint({ watchedTo = 0, remembered = 0, stopsAt = 0, previewEnded = false }) {
  const watched = Math.max(0, Number(watchedTo) || 0)
  const saved = Math.max(0, Number(remembered) || 0)
  const stop = Math.max(0, Number(stopsAt) || 0)

  let from = Math.max(watched, saved)

  // A position under two seconds is the player having reset, not someone who
  // genuinely watched two seconds and paid.
  if (from < 2 && stop > 2 && previewEnded) return stop
  if (from < 2 && stop > 2 && watched >= stop - 1.5) return stop

  return from
}
