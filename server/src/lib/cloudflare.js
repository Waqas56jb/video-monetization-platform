import crypto from 'node:crypto'
import { env, capabilities } from '../config/env.js'
import { serviceUnavailable, badRequest } from './errors.js'
import { log } from './logger.js'

const API = 'https://api.cloudflare.com/client/v4'

const requireStream = () => {
  if (!capabilities.cloudflareStream) {
    throw serviceUnavailable(
      'Cloudflare Stream is not configured. Set CLOUDFLARE_ACCOUNT_ID and ' +
        'CLOUDFLARE_API_TOKEN (Account → Stream → Edit) in server/.env.'
    )
  }
}

async function cf(pathname, { method = 'GET', body, headers = {} } = {}) {
  requireStream()
  const res = await fetch(`${API}/accounts/${env.cloudflare.accountId}${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${env.cloudflare.apiToken}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  const text = await res.text()
  let json
  try {
    json = text ? JSON.parse(text) : {}
  } catch {
    throw new Error(`Cloudflare returned a non-JSON response (${res.status})`)
  }

  if (!res.ok || json.success === false) {
    // Cloudflare puts the generic failure in `errors` but the ACTUAL reason in
    // `messages` — e.g. errors says "Authorization Failure" while messages says
    // "Cloudflare Stream not enabled". Surface both or the cause is invisible.
    const errors = json?.errors?.map((e) => e.message).filter(Boolean) || []
    const messages = json?.messages?.map((m) => m.message ?? m).filter(Boolean) || []
    const detail = [...new Set([...messages, ...errors])].join(' — ') || res.statusText

    const err = new Error(`Cloudflare Stream: ${detail}`)
    err.status = res.status === 403 ? 503 : res.status
    err.expected = true

    if (/not enabled/i.test(detail)) {
      err.message =
        'Cloudflare Stream is not enabled on this account. Subscribe to Stream in the ' +
        'Cloudflare dashboard (Stream → Get started) — the API token is valid but the ' +
        'service itself has not been activated.'
    }
    throw err
  }
  return json.result
}

/**
 * A one-time URL the creator's browser uploads straight to.
 *
 * The file never passes through this server, which is the whole point: a
 * hundred simultaneous uploads cost us nothing and cannot slow the API down.
 */
export async function createDirectUpload({ maxDurationSeconds = 7200, meta = {}, creatorId }) {
  const result = await cf('/stream/direct_upload', {
    method: 'POST',
    body: {
      maxDurationSeconds,
      requireSignedURLs: true, // the paywall depends on this
      allowedOrigins: env.corsOrigins.map((o) => o.replace(/^https?:\/\//, '')),
      meta: { ...meta, creatorId, platform: 'mtonyo' },
    },
  })
  return { uploadUrl: result.uploadURL, uid: result.uid }
}

export async function getVideo(uid) {
  return cf(`/stream/${uid}`)
}

export async function deleteVideo(uid) {
  return cf(`/stream/${uid}`, { method: 'DELETE' })
}

/**
 * Clip a section out of an existing video.
 *
 * Used twice: for the free-preview asset (which is public, so it can be played
 * without a token) and for the 60-second social promo clip. Doing it here
 * means no FFmpeg worker to run or pay for.
 */
export async function createClip({ uid, startSeconds, endSeconds, requireSignedURLs = false, name }) {
  if (endSeconds <= startSeconds) throw badRequest('Clip end must be after its start')
  return cf('/stream/clip', {
    method: 'POST',
    body: {
      clippedFromVideoUID: uid,
      startTimeSeconds: Math.max(0, Math.floor(startSeconds)),
      endTimeSeconds: Math.floor(endSeconds),
      requireSignedURLs,
      meta: { name: name || 'clip', platform: 'mtonyo' },
    },
  })
}

/** Create a signing key. Run once; store the id + PEM in .env. */
export async function createSigningKey() {
  const result = await cf('/stream/keys', { method: 'POST' })
  return { id: result.id, pem: result.pem, jwk: result.jwk }
}

/**
 * A short-lived signed token for one video.
 *
 * This is what makes a copied link useless: the token carries an expiry, so a
 * URL shared with a friend stops working within minutes and never unlocks a
 * video the friend has not paid for.
 */
export function signPlaybackToken(uid, { expiresInSeconds = 3600, downloadable = false } = {}) {
  if (!capabilities.signedPlayback) {
    throw serviceUnavailable(
      'Signed playback is not configured. Run "npm run cf:key" once and put the ' +
        'returned id/PEM into CLOUDFLARE_STREAM_KEY_ID and CLOUDFLARE_STREAM_KEY_PEM.'
    )
  }

  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', kid: env.cloudflare.streamKeyId }
  const payload = {
    sub: uid,
    kid: env.cloudflare.streamKeyId,
    exp: now + expiresInSeconds,
    nbf: now - 30, // small skew allowance for phones with a drifting clock
    downloadable,
  }

  const b64 = (obj) =>
    Buffer.from(JSON.stringify(obj)).toString('base64url')

  const signingInput = `${b64(header)}.${b64(payload)}`
  const pem = Buffer.from(env.cloudflare.streamKeyPem, 'base64').toString('utf8')
  const signature = crypto
    .createSign('RSA-SHA256')
    .update(signingInput)
    .sign(pem)
    .toString('base64url')

  return `${signingInput}.${signature}`
}

/** Everything the player needs for one video. */
export function playbackUrls(uidOrToken) {
  return {
    hls: `https://videodelivery.net/${uidOrToken}/manifest/video.m3u8`,
    dash: `https://videodelivery.net/${uidOrToken}/manifest/video.mpd`,
    iframe: `https://iframe.videodelivery.net/${uidOrToken}`,
    thumbnail: `https://videodelivery.net/${uidOrToken}/thumbnails/thumbnail.jpg`,
  }
}

/** Verify the signature Cloudflare puts on its webhook calls. */
export function verifyWebhookSignature(header, rawBody) {
  if (!env.cloudflare.webhookSecret) return true // not configured yet
  if (!header) return false
  const parts = Object.fromEntries(
    String(header)
      .split(',')
      .map((p) => p.split('=').map((s) => s.trim()))
  )
  const time = parts.time
  const sig = parts.sig1
  if (!time || !sig) return false

  const expected = crypto
    .createHmac('sha256', env.cloudflare.webhookSecret)
    .update(`${time}.${rawBody}`)
    .digest('hex')

  try {
    return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))
  } catch {
    return false
  }
}

export const cloudflareReady = () => capabilities.cloudflareStream

export { log }
