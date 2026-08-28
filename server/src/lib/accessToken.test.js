import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SignJWT } from 'jose'
import { ApiError } from './errors.js'
import {
  verifySupabaseAccessToken,
  resolveAuthUser,
  SESSION_EXPIRED,
} from './accessToken.js'

const SECRET = 'test-jwt-secret-at-least-32-characters'
const OTHER = 'other-jwt-secret-at-least-32-characters'
const USER_ID = '607d4719-1905-4f1a-9c55-993647a543d0'

async function mint(claims = {}, { secret = SECRET, exp = '1h', aud = 'authenticated' } = {}) {
  let jwt = new SignJWT({
    sub: USER_ID,
    email: 'viewer@example.com',
    role: 'authenticated',
    ...claims,
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime(exp)
  if (aud) jwt = jwt.setAudience(aud)
  return jwt.sign(new TextEncoder().encode(secret))
}

test('valid token yields user id from sub', async () => {
  const token = await mint()
  const user = await verifySupabaseAccessToken(token, SECRET)
  assert.equal(user.id, USER_ID)
  assert.equal(user.email, 'viewer@example.com')
})

test('expired token is 401 session expired', async () => {
  const token = await mint({}, { exp: Math.floor(Date.now() / 1000) - 120 })
  await assert.rejects(
    () => verifySupabaseAccessToken(token, SECRET),
    (err) => err instanceof ApiError && err.status === 401 && err.message === SESSION_EXPIRED
  )
})

test('tampered signature is 401', async () => {
  const token = await mint()
  const parts = token.split('.')
  parts[2] = parts[2].replace(/[A-Za-z]/, (c) => (c === 'A' ? 'B' : 'A'))
  await assert.rejects(
    () => verifySupabaseAccessToken(parts.join('.'), SECRET),
    (err) => err instanceof ApiError && err.status === 401
  )
})

test('wrong secret is 401, not a remote fallback', async () => {
  const token = await mint()
  let remoteCalls = 0
  await assert.rejects(
    () =>
      resolveAuthUser(token, {
        jwtSecret: OTHER,
        remoteGetUser: async () => {
          remoteCalls += 1
          return { id: USER_ID }
        },
      }),
    (err) => err instanceof ApiError && err.status === 401
  )
  assert.equal(remoteCalls, 0)
})

test('missing secret falls back to remote getUser', async () => {
  const token = await mint()
  let remoteCalls = 0
  const user = await resolveAuthUser(token, {
    jwtSecret: '',
    remoteGetUser: async (passed) => {
      remoteCalls += 1
      assert.equal(passed, token)
      return { id: USER_ID, email: 'from-remote@example.com' }
    },
  })
  assert.equal(remoteCalls, 1)
  assert.equal(user.id, USER_ID)
  assert.equal(user.email, 'from-remote@example.com')
})

test('audience other than authenticated is refused', async () => {
  const token = await mint({}, { aud: 'anon' })
  await assert.rejects(() => verifySupabaseAccessToken(token, SECRET), ApiError)
})

test('ES256 access token verifies against JWKS without a JWT secret', async () => {
  const { generateKeyPair, exportJWK, createLocalJWKSet } = await import('jose')
  const { publicKey, privateKey } = await generateKeyPair('ES256')
  const jwk = await exportJWK(publicKey)
  jwk.kid = 'test-es256'
  jwk.alg = 'ES256'
  jwk.use = 'sig'
  const jwks = createLocalJWKSet({ keys: [jwk] })
  const token = await new SignJWT({
    sub: USER_ID,
    email: 'viewer@example.com',
    role: 'authenticated',
  })
    .setProtectedHeader({ alg: 'ES256', kid: 'test-es256', typ: 'JWT' })
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey)

  const user = await resolveAuthUser(token, { jwtSecret: '', jwks })
  assert.equal(user.id, USER_ID)
})
