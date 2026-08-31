/**
 * Whether the Watch page shows the film or the paywall.
 *
 * Lifted out of Watch.jsx so it can be tested by running it. The page itself
 * cannot be imported by `node --test` — it is JSX, and it reaches half the app —
 * so while this lived inside it the only available test was one that matched the
 * source text, and that is a test which keeps passing after the behaviour breaks.
 * A viewer being shown Unlock on a film they paid for is exactly the failure that
 * deserves better than that.
 *
 * Three rules, each of which has been wrong at some point:
 *
 * **Nothing is locked until the answer is in.** Treating every video as locked
 * while the request was in flight flashed the paywall on films the viewer owned.
 * `accessReady` is false until playback has arrived *for this video*, and until
 * then `locked` is false.
 *
 * **A payload for another video is not an answer.** The caller decides that —
 * it passes `playback` only once it matches the video on screen.
 *
 * **A purchase is a purchase of one thing.** `justPaidFor` holds an id, never a
 * boolean: a bare `justPaid` from video A stayed true on B, C and D, so the
 * paywall never appeared even though only A had been signed.
 */
export function watchLockState({
  playback = null,
  loading = false,
  justPaidFor = null,
  videoId = null,
  video = null,
} = {}) {
  const accessReady = Boolean(playback) && !loading
  const locked = accessReady ? !playback.access?.canWatchFull : false

  const justPaid =
    Boolean(justPaidFor) &&
    (justPaidFor === videoId || justPaidFor === video?.id || justPaidFor === video?.slug)

  return {
    accessReady,
    locked,
    justPaid,
    owned: justPaid || (accessReady && !locked),
    needsPayment: locked && Number(video?.priceTzs || 0) > 0 && !justPaid,
  }
}
