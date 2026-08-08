/**
 * localStorage that can never crash the app.
 *
 * On iOS Safari, merely *reading* `window.localStorage` throws a SecurityError
 * when the user is in Private Browsing or has "Block All Cookies" enabled — it
 * is not enough to guard the read/write calls, the property access itself has
 * to be wrapped. An unguarded access booted the whole app to a blank screen for
 * those users.
 *
 * Storage here is a convenience (remembering the chosen role across a refresh),
 * never a correctness requirement, so failing silently is the right behaviour.
 */
const read = () => {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function getItem(key) {
  try {
    return read()?.getItem(key) ?? null
  } catch {
    return null
  }
}

export function setItem(key, value) {
  try {
    read()?.setItem(key, value)
    return true
  } catch {
    // private mode, quota exceeded, or storage disabled — not worth surfacing
    return false
  }
}

export function removeItem(key) {
  try {
    read()?.removeItem(key)
  } catch {
    /* ignore */
  }
}
