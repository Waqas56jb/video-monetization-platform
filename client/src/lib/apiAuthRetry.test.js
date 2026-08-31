import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * api.js cannot be imported here — it reads `import.meta.env`, which only Vite
 * defines — so this is a source assertion, and a weak kind of test. The two
 * rules it guards are tested for real elsewhere: sessionRules.test.js runs the
 * status decision, and the server's optionalAuth.signal.test.js boots an app and
 * reads the header off a live response. What is left for this file is that api.js
 * actually calls them.
 */
const src = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), 'api.js'),
  'utf8'
)

test('a failed refresh only clears the session when the server judged the token', () => {
  assert.match(src, /if \(refreshTokenRejected\(res\.status\)\) \{\s*\n\s*clearSession\(\)/)
  assert.match(src, /import \{ refreshTokenRejected \} from '\.\/sessionRules'/)
})

test('an X-Auth-Status: expired response triggers one refresh and retry', () => {
  assert.match(src, /res\.headers\.get\('X-Auth-Status'\) === 'expired'/)
  // Guarded on having sent a token, so an anonymous caller cannot loop.
  assert.match(src, /if \(token && retry && res\.headers\.get\('X-Auth-Status'\)/)
  // retry: false on the second attempt — one retry, never a loop.
  assert.match(src, /const fresh = await refreshAccessToken\(\)\s*\n\s*if \(fresh\) return request\(path, \{ method, body, auth, retry: false, signal \}\)/)
})
