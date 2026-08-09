import crypto from 'node:crypto'
import { userClient } from '../lib/supabase.js'
import { badRequest } from '../lib/errors.js'
import { log } from '../lib/logger.js'

/**
 * Pictures people upload: profile photos and video covers.
 *
 * Uploaded with the caller's own token rather than an all-powerful key, so the
 * storage policies apply as written — everything lands in a folder named after
 * the uploader's account id, and nobody can write into anyone else's. If those
 * policies were ever loosened by mistake, this would still be constrained by
 * them rather than sailing past on a service key.
 *
 * Video files do NOT come through here; they go straight from the browser to
 * Cloudflare. These are small images, where a round trip costs nothing and
 * keeps the storage credentials off the public site.
 */

const ALLOWED = {
  avatars: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  thumbnails: ['image/jpeg', 'image/png', 'image/webp'],
}

const MAX_BYTES = {
  avatars: 2 * 1024 * 1024, // 2 MB
  thumbnails: 5 * 1024 * 1024, // 5 MB
}

const EXTENSION = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

/** Reject before uploading, so nobody waits to be told no. */
export function checkImage(bucket, file) {
  if (!file) return 'Choose an image'
  if (!ALLOWED[bucket]?.includes(file.mimetype)) {
    return `That file is a ${file.mimetype || 'unknown type'}. Use a JPEG, PNG${bucket === 'avatars' ? ', GIF' : ''} or WebP.`
  }
  if (file.size > MAX_BYTES[bucket]) {
    return `That image is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_BYTES[bucket] / 1024 / 1024} MB.`
  }
  if (file.size < 64) return 'That file looks empty.'
  return null
}

/**
 * Store an image and return the URL to show it at.
 *
 * The name is random rather than derived from the original filename: two people
 * uploading "photo.jpg" must not collide, and a predictable name would let
 * anyone guess at someone else's picture. The random part also busts the CDN
 * cache, so a replaced photo actually looks replaced instead of showing the old
 * one until the browser gives up on it.
 */
export async function storeImage({ bucket, file, userId, accessToken }) {
  const problem = checkImage(bucket, file)
  if (problem) throw badRequest(problem)

  const ext = EXTENSION[file.mimetype] || 'jpg'
  const key = `${userId}/${crypto.randomBytes(12).toString('hex')}.${ext}`

  const client = userClient(accessToken)
  const { error } = await client.storage.from(bucket).upload(key, file.buffer, {
    contentType: file.mimetype,
    cacheControl: '31536000', // a year: the name changes whenever the image does
    upsert: false,
  })

  if (error) {
    log.warn(`upload to ${bucket} failed: ${error.message}`)
    if (/row-level security|not authorized|Unauthorized/i.test(error.message)) {
      throw badRequest('You are not allowed to upload there')
    }
    if (/exceeded the maximum|Payload too large/i.test(error.message)) {
      throw badRequest('That image is too large')
    }
    if (/mime type|not supported/i.test(error.message)) {
      throw badRequest('That image format is not supported')
    }
    throw badRequest(`Could not save the image: ${error.message}`)
  }

  const { data } = client.storage.from(bucket).getPublicUrl(key)
  return { url: data.publicUrl, key }
}

/**
 * Remove an image we previously stored.
 *
 * Best effort on purpose: a replaced photo that fails to delete leaves an
 * orphan taking up space, which is a nuisance. Refusing to save the new one
 * because the old one would not go is worse.
 */
export async function removeImage({ bucket, url, accessToken }) {
  const key = keyFromUrl(bucket, url)
  if (!key) return false
  try {
    const { error } = await userClient(accessToken).storage.from(bucket).remove([key])
    if (error) throw error
    return true
  } catch (err) {
    log.warn(`could not remove ${bucket}/${key}: ${err.message}`)
    return false
  }
}

/** Recover the storage key from a public URL, so a replacement can clean up. */
export function keyFromUrl(bucket, url) {
  if (!url) return null
  const marker = `/storage/v1/object/public/${bucket}/`
  const at = url.indexOf(marker)
  return at === -1 ? null : decodeURIComponent(url.slice(at + marker.length))
}
