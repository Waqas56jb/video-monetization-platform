/**
 * How Watch should frame the player.
 *
 * Landscape stays a wide 16:9 stage. Portrait and square use the file's own
 * ratio and grow to the available height, instead of floating as a thin strip
 * inside a black 16:9 box.
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

export function videoShape(width, height) {
  const w = Number(width) || 0
  const h = Number(height) || 0
  const orientation = videoOrientation(w, h) || 'landscape'
  if (!(w > 0 && h > 0)) {
    return { orientation: 'landscape', aspect: '16 / 9', ratio: 16 / 9 }
  }
  return {
    orientation,
    aspect: `${Math.round(w)} / ${Math.round(h)}`,
    ratio: w / h,
  }
}
