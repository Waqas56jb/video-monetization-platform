import crypto from 'node:crypto'
import { env } from '../config/env.js'
import { log } from './logger.js'

/**
 * A key an `<img>` tag can actually carry.
 *
 * An image element cannot send an Authorization header — the browser fetches
 * it as a plain request — so a poster behind auth renders as a broken image no
 * matter how correct the endpoint is. That is why every thumbnail in the review
 * queue and the creator's own submissions was a grey box: the endpoint was
 * working and answering 404 to a request that could not identify itself.
 *
 * So the key travels in the URL instead. It is scoped to one video and to
 * thumbnails only, and it expires — it grants a poster and nothing else. In
 * particular it is NOT the Cloudflare playback token, which would hand over the
 * paid video along with its picture.
 *
 * Published videos need none of this; their posters are public.
 */

const PURPOSE = 'thumb'
const DEFAULT_TTL = 6 * 60 * 60 // six hours: long enough for a working session

let warned = false

function secret() {
  if (env.mediaTokenSecret) return env.mediaTokenSecret
  if (env.cronSecret) return env.cronSecret
  // Stable fallback so creator-studio posters still render when only DB keys are set.
  const stable = env.supabase.serviceRoleKey || env.databaseUrl
  if (stable) {
    return crypto.createHash('sha256').update(`mtonyo-thumb:${stable}`).digest('hex')
  }
  if (!warned) {
    warned = true
    log.warn(
      'MEDIA_TOKEN_SECRET (or CRON_SECRET) is not set — posters for unpublished ' +
        'videos cannot be signed, so they will not render for creators or staff.'
    )
  }
  return ''
}

const sign = (payload) =>
  crypto.createHmac('sha256', secret()).update(payload).digest('base64url')

/** A key for this video's poster, valid for a few hours. */
export function mintThumbnailKey(videoId, ttlSeconds = DEFAULT_TTL) {
  if (!secret()) return null
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds
  const payload = `${PURPOSE}:${videoId}:${expires}`
  return `${expires}.${sign(payload)}`
}

/** Is this key genuinely ours, for this video, and still in date? */
export function verifyThumbnailKey(videoId, key) {
  if (!key || !secret()) return false

  const [expiresRaw, signature] = String(key).split('.')
  const expires = Number(expiresRaw)
  if (!Number.isFinite(expires) || !signature) return false
  if (expires < Math.floor(Date.now() / 1000)) return false

  const expected = sign(`${PURPOSE}:${videoId}:${expires}`)

  // Constant-time, so the comparison itself gives nothing away.
  const a = Buffer.from(signature)
  const b = Buffer.from(expected)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}
