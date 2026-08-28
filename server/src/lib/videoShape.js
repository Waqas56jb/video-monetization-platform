/**
 * How a film is framed — landscape, portrait, or square.
 *
 * Watch sizes the player from these numbers. Without them every title is
 * forced into 16:9 and a phone-shot video sits as a thin strip in a black box.
 */

export function videoOrientation(width, height) {
  const w = Number(width) || 0
  const h = Number(height) || 0
  if (!(w > 0 && h > 0)) return null
  const ratio = w / h
  if (ratio < 0.9) return 'portrait'
  if (ratio > 1.1) return 'landscape'
  return 'square'
}

/** Pixel size Cloudflare reports on a ready Stream video or webhook body. */
export function dimensionsFromCloudflare(remote = {}) {
  const input = remote.input && typeof remote.input === 'object' ? remote.input : {}
  const w = Math.round(Number(input.width ?? remote.width ?? 0))
  const h = Math.round(Number(input.height ?? remote.height ?? 0))
  if (!(w > 0 && h > 0)) return { width: null, height: null }
  return { width: w, height: h }
}
