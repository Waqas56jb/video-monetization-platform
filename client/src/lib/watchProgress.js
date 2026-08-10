/**
 * Where the viewer got to, kept on this device as well as on the server.
 *
 * The server copy is the one that matters — it follows the account across
 * devices — but it can only be written for somebody who is signed in. That left
 * a gap exactly where it hurt most: a visitor watches five minutes of a free
 * preview, taps Unlock, signs in, comes back… and the video starts again,
 * because nothing had been recorded for them yet.
 *
 * So the position is also kept here, in session storage, from the first second
 * of the preview. It is handed to the server as soon as we know who they are,
 * and it survives the round trip through the login page in the meantime.
 *
 * Session storage rather than local storage on purpose: this is "where I am
 * right now", not a permanent record. Closing the tab should forget it, and the
 * server has the durable copy for anyone with an account.
 */

const KEY = (videoId) => `mtonyo:progress:${videoId}`

/** Remember a position. Ignores nonsense and the first few seconds. */
export function rememberProgress(videoId, seconds) {
  if (!videoId) return
  const s = Math.floor(Number(seconds) || 0)
  if (s < 5) return
  try {
    sessionStorage.setItem(KEY(videoId), String(s))
  } catch {
    /* Private browsing, or storage full. Losing a resume point is survivable. */
  }
}

/** The position remembered on this device, or 0. */
export function recallProgress(videoId) {
  if (!videoId) return 0
  try {
    const raw = sessionStorage.getItem(KEY(videoId))
    const s = Math.floor(Number(raw) || 0)
    return s > 0 ? s : 0
  } catch {
    return 0
  }
}

/** Forget it — used once the server has taken ownership of the position. */
export function forgetProgress(videoId) {
  if (!videoId) return
  try {
    sessionStorage.removeItem(KEY(videoId))
  } catch {
    /* nothing to do */
  }
}
