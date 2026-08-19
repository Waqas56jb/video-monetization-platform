/**
 * How long a free preview may be.
 *
 * The old ceiling was `duration - 1`, so a 54-second clip could give away 53
 * seconds and leave one second behind the paywall. That is not a commercial
 * preview — it is the whole video for free.
 *
 * Half the running time is the rule. A 45-second teaser of a 3-minute song and
 * the first half-hour of a two-hour film both still fit; 53s of 54s does not.
 * Duration unknown (still encoding) → no cap yet, clamp once the length lands.
 */

export function maxFreePreviewSeconds(durationSeconds) {
  const duration = Math.max(0, Math.floor(Number(durationSeconds) || 0))
  if (!duration) return null
  return Math.floor(duration / 2)
}

export function clampFreePreviewSeconds(asked, durationSeconds) {
  const want = Math.max(0, Math.floor(Number(asked) || 0))
  const most = maxFreePreviewSeconds(durationSeconds)
  if (most == null) return want
  return Math.min(want, most)
}

/**
 * Postgres expression: shrink `free_preview_seconds` to half the running time
 * once duration is known. `durationExpr` must be a trusted SQL fragment
 * (`duration_seconds` or `coalesce($2, duration_seconds)`).
 */
export function clampPreviewSql(durationExpr = 'duration_seconds') {
  return `case
    when coalesce(${durationExpr}, 0) > 0
    then least(free_preview_seconds, coalesce(${durationExpr}, 0) / 2)
    else free_preview_seconds
  end`
}
