/**
 * Where the video picks up once it has been paid for.
 *
 * The client's report was precise: after paying, the video restarted from the
 * beginning instead of continuing from where the preview stopped. The cause is
 * that the preview is a separate, shorter asset -- when it ends, or is paused
 * at the paywall, the player often reports currentTime back at 0. Trusting
 * that number alone is what produced a restart.
 *
 * So four sources are considered and the furthest honest one wins:
 *   - `captured`: what the player itself said, read at the paywall or the
 *     moment checkout opened. This is the most authoritative of the four,
 *     because the page's own idea of the position stops being updated exactly
 *     when a finished preview halts — the instant it matters most.
 *   - how far this session actually watched
 *   - what was remembered locally for this video
 *   - the preview's own stop point, when the viewer is known to have reached it
 *
 * That last clause is the fix. Kept here as a plain function because it is a
 * rule the client can read, and one that has to keep holding.
 */
export function resumePoint({
  captured = 0,
  watchedTo = 0,
  remembered = 0,
  stopsAt = 0,
  previewEnded = false,
}) {
  const seen = Math.max(0, Number(captured) || 0)
  const watched = Math.max(0, Number(watchedTo) || 0)
  const saved = Math.max(0, Number(remembered) || 0)
  const stop = Math.max(0, Number(stopsAt) || 0)

  const from = Math.max(seen, watched, saved)

  // A real position is a real position. Promoting it to the preview's end
  // would invent seconds the viewer never saw.
  if (from >= 2) return from

  /**
   * Nothing survived — which is exactly what a finished preview asset looks
   * like, because it reports its position back at 0. Fall back to the preview's
   * own end, but only on evidence the viewer actually got there.
   *
   * `previewEnded` is that evidence, and it is the only thing here that can be.
   * A companion clause used to test `watched >= stop - 1.5` as a second,
   * independent proof; it could never fire. `from` is the maximum of the
   * positions, so `from < 2` already means every position is under two seconds,
   * and no position under two seconds is also within 1.5s of a preview end
   * worth resuming to. It read as a safety net and was decoration, so it is
   * gone rather than left to reassure the next person.
   *
   * Somebody who paid at 0:05 without watching still starts at the beginning.
   * Skipping them past film they never saw would be a worse failure than the
   * one being fixed — which is why the preview's end is a fallback for a lost
   * position and never simply the largest number on offer.
   */
  if (stop > 2 && previewEnded) return stop

  return from
}
