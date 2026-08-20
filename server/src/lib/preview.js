/**
 * How long a free preview may be.
 *
 * Two ceilings have been wrong here. `duration - 1` let a 54-second clip give
 * away 53 seconds. Half the running time replaced it and was rejected in turn:
 * a two-hour film does not get a one-hour preview, and a song does not give
 * away half the song.
 *
 * The rule now is the smaller of two things, and it is not a share of the film
 * in the way half was — the ceiling on anything long is a fixed number of
 * minutes, not a proportion:
 *
 *   • five minutes, whatever the video is
 *   • a third of the running time, so short pieces stay in proportion
 *
 * Against the cases that were asked for:
 *
 *   54s clip          →  18s   (53s of 54s is impossible)
 *   3-minute song     →  60s   (asked for 30-60s, not 90s)
 *   10:53 concert     →  3:37  (asked for 2-5 minutes)
 *   2-hour film       →  5:00  (asked for 2-5 minutes, not an hour)
 *
 * The creator still chooses the number below that; this only says how far it
 * may go.
 *
 * Duration unknown, which is every upload before it finishes encoding: the
 * five-minute ceiling still applies, because it never depended on knowing the
 * length. Only the proportional part waits. That matters — the upload form is
 * where the number is first typed, and it used to accept anything at all
 * there and correct it silently hours later.
 */

/** Nothing may give away more than this, however long the video is. */
export const PLATFORM_MAX_PREVIEW_SECONDS = 300

/** And nothing may give away more of a short piece than this share of it. */
const SHARE_OF_RUNNING_TIME = 3

export function maxFreePreviewSeconds(durationSeconds) {
  const duration = Math.max(0, Math.floor(Number(durationSeconds) || 0))
  if (!duration) return PLATFORM_MAX_PREVIEW_SECONDS
  return Math.min(PLATFORM_MAX_PREVIEW_SECONDS, Math.floor(duration / SHARE_OF_RUNNING_TIME))
}

export function clampFreePreviewSeconds(asked, durationSeconds) {
  const want = Math.max(0, Math.floor(Number(asked) || 0))
  return Math.min(want, maxFreePreviewSeconds(durationSeconds))
}

/**
 * Postgres expression bringing `free_preview_seconds` under the ceiling once
 * the duration is known. `durationExpr` must be a trusted SQL fragment
 * (`duration_seconds` or `coalesce($2, duration_seconds)`).
 */
export function clampPreviewSql(durationExpr = 'duration_seconds') {
  return `case
    when coalesce(${durationExpr}, 0) > 0
    then least(
      free_preview_seconds,
      ${PLATFORM_MAX_PREVIEW_SECONDS},
      coalesce(${durationExpr}, 0) / ${SHARE_OF_RUNNING_TIME}
    )
    else least(free_preview_seconds, ${PLATFORM_MAX_PREVIEW_SECONDS})
  end`
}
