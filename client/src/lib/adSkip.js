/**
 * When Skip may appear on an in-stream ad.
 *
 * `0` means non-skippable. Otherwise Skip waits until the ad has actually
 * been playing for that many seconds — not until the panel has been mounted.
 */
export function adSkipRules(skipAfterSeconds) {
  const configured = Number(skipAfterSeconds)
  const skippable = Number.isFinite(configured) ? configured > 0 : true
  const skipAfter = skippable ? Math.max(1, configured || 5) : Infinity
  return { skippable, skipAfter }
}

export function adCanSkip(skipAfterSeconds, elapsedSeconds, playing) {
  const { skippable, skipAfter } = adSkipRules(skipAfterSeconds)
  return skippable && Boolean(playing) && Number(elapsedSeconds) >= skipAfter
}
