/**
 * A "Could not load this" box that fixes itself once the connection is back.
 *
 * Client, 2026-11-25 (iPad, 08:32 Dar es Salaam): Explore and My Library both
 * showed "We could not reach the server just now". The API logs show that
 * every request from that iPad was answered (200) from 08:25 to 08:30, then
 * NOTHING arrived from it until 08:38, when it came back from a different
 * network address (102.205.x → 102.202.x) and everything loaded. The server
 * did not fail; the device was between networks. The box itself was the
 * problem: it stayed up until someone tapped "Try again", so the site looked
 * broken long after the connection had already come back.
 *
 * So while an error box is on screen it retries on its own:
 *   - the moment the device reports it is back online,
 *   - when the person returns to the tab or app (Safari freezes background tabs),
 *   - and on a short, bounded schedule in case neither event fires.
 * Every onRetry in this app is a read (useApi reload / a list fetch), so a
 * repeat is safe. When the retry succeeds the box unmounts and this stops.
 */
export const RECOVER_DELAYS_MS = [4_000, 10_000, 20_000, 40_000, 60_000]

/**
 * Some screens unmount the box while they retry and mount a fresh one if it
 * fails again (Explore does), so the schedule's position is shared, not per
 * box: a dead connection costs at most `delays.length` timed retries in a
 * row, never a 4-second loop. It starts over after a quiet spell.
 */
export const QUIET_RESET_MS = 2 * 60_000
export const sharedSchedule = { step: 0, lastAt: 0 }

export function autoRecover(
  onRetry,
  { win = globalThis.window, doc = globalThis.document, delays = RECOVER_DELAYS_MS, shared = sharedSchedule, now = () => Date.now() } = {}
) {
  if (typeof onRetry !== 'function' || !win) return () => {}
  let stopped = false
  let busy = false
  let timer = null
  if (now() - shared.lastAt > QUIET_RESET_MS) shared.step = 0

  const attempt = async () => {
    if (stopped || busy) return
    if (win.navigator && win.navigator.onLine === false) return // wait for 'online'
    busy = true
    try {
      await onRetry()
    } catch {
      /* the box stays; the next trigger tries again */
    } finally {
      busy = false
    }
  }

  const schedule = () => {
    if (stopped || shared.step >= delays.length) return
    timer = win.setTimeout(async () => {
      shared.step += 1
      shared.lastAt = now()
      await attempt()
      schedule()
    }, delays[shared.step])
  }

  const onOnline = () => attempt()
  const onVisible = () => {
    if (!doc || doc.visibilityState !== 'hidden') attempt()
  }

  win.addEventListener('online', onOnline)
  win.addEventListener('focus', onVisible)
  doc?.addEventListener?.('visibilitychange', onVisible)
  schedule()

  return () => {
    stopped = true
    if (timer) win.clearTimeout(timer)
    win.removeEventListener('online', onOnline)
    win.removeEventListener('focus', onVisible)
    doc?.removeEventListener?.('visibilitychange', onVisible)
  }
}
