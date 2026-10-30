/**
 * Is this file one the server will take as a sponsor banner?
 *
 * Checked before anything is saved: the sponsor is created first and the image
 * uploaded second, so an image refused only by the server used to leave a
 * sponsor behind with the form still saying "Add sponsor" — press it again and
 * there were two. Same rules as the server (services/uploads.js, thumbnails).
 */
export const SPONSOR_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const SPONSOR_IMAGE_MAX_BYTES = 5 * 1024 * 1024

export function sponsorImageProblem(file) {
  if (!file) return null
  if (!SPONSOR_IMAGE_TYPES.includes(file.type)) return 'Use a JPEG, PNG or WebP image.'
  if (file.size > SPONSOR_IMAGE_MAX_BYTES) return `That image is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 5 MB.`
  if (file.size < 64) return 'That image file looks empty.'
  return null
}
