import { jwtVerify, decodeProtectedHeader } from 'jose'
import { unauthorized } from './errors.js'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const SESSION_EXPIRED = 'Your session has expired — please sign in again'

function userFromPayload(payload) {
  const sub = String(payload.sub || '')
  if (!UUID_RE.test(sub)) throw unauthorized(SESSION_EXPIRED)
  if (payload.role === 'service_role' || payload.role === 'anon') {
    throw unauthorized(SESSION_EXPIRED)
  }
  return { id: sub, email: payload.email ? String(payload.email) : null }
}

/**
 * Verify a Supabase access token locally instead of calling Auth getUser.
 *
 * This project signs user access tokens with ES256 and publishes JWKS.
 * Legacy / dashboard "JWT Secret" tokens are HS256. Both are checked for
 * signature, exp, and aud = authenticated. The user id is `sub`.
 */
export async function verifySupabaseAccessToken(token, secret) {
  return verifyAccessToken(token, { jwtSecret: secret })
}

export async function verifyAccessToken(token, { jwtSecret, jwks } = {}) {
  if (!token) throw unauthorized(SESSION_EXPIRED)

  let alg
  try {
    alg = decodeProtectedHeader(token).alg
  } catch {
    throw unauthorized(SESSION_EXPIRED)
  }

  try {
    if (alg === 'ES256' || alg === 'RS256') {
      if (!jwks) throw new Error('jwks unavailable')
      const { payload } = await jwtVerify(token, jwks, {
        audience: 'authenticated',
        clockTolerance: 30,
      })
      return userFromPayload(payload)
    }

    if (alg === 'HS256') {
      if (!jwtSecret) throw new Error('jwt secret unavailable')
      const { payload } = await jwtVerify(token, new TextEncoder().encode(jwtSecret), {
        algorithms: ['HS256'],
        audience: 'authenticated',
        clockTolerance: 30,
      })
      return userFromPayload(payload)
    }
  } catch (err) {
    if (err instanceof Error && /unavailable$/.test(err.message)) throw err
    throw unauthorized(SESSION_EXPIRED)
  }

  throw unauthorized(SESSION_EXPIRED)
}

/**
 * Local verify when we can (JWKS for ES256, JWT secret for HS256).
 * Remote getUser only when local verification cannot run — never when a
 * configured secret/JWKS rejected the token.
 */
export async function resolveAuthUser(token, { jwtSecret, jwks, remoteGetUser } = {}) {
  let alg
  try {
    alg = decodeProtectedHeader(token).alg
  } catch {
    throw unauthorized(SESSION_EXPIRED)
  }

  const canLocalAsym = (alg === 'ES256' || alg === 'RS256') && jwks
  const canLocalHs = alg === 'HS256' && jwtSecret

  if (canLocalAsym || canLocalHs) {
    return verifyAccessToken(token, { jwtSecret, jwks })
  }

  if (typeof remoteGetUser === 'function') return remoteGetUser(token)
  throw unauthorized(SESSION_EXPIRED)
}
