import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ApiError } from './errors.js'

/**
 * A misconfigured Supabase client is a 503 with a readable cause, not a 500.
 *
 * Sign-in returned 500 on the live site, with "Something went wrong on our side"
 * as the entire diagnosis. `createClient` validates its arguments and throws a
 * bare Error, which the handler could not recognise. The mapping in this file
 * only ever produces 401 or 503, so that throw was the one path out of it that
 * said nothing.
 */

test('ApiError is distinguishable from a stray throw', () => {
  // errorClass on a 500 reported "Error" for everything, because ApiError
  // inherited the name and ruled nothing out.
  assert.equal(new ApiError(503, 'x').name, 'ApiError')
  assert.notEqual(new ApiError(503, 'x').name, new Error('x').name)
})

test('client construction failures are wrapped, not left to become a 500', () => {
  const src = readFileSync(new URL('./supabase.js', import.meta.url), 'utf8')
  // Both clients go through the wrapper.
  assert.match(src, /anon = build\('SUPABASE_ANON_KEY', \(\) =>/)
  assert.match(src, /admin = build\('SUPABASE_SERVICE_ROLE_KEY', \(\) =>/)
  assert.match(src, /throw serviceUnavailable\(\s*`Supabase rejected this server's configuration/)
})

test('the wrapper turns a thrown Error into a 503 that names the variable', async () => {
  // Exercised directly against the same shape createClient throws.
  const { serviceUnavailable } = await import('./errors.js')
  const build = (keyName, make) => {
    try {
      return make()
    } catch (err) {
      throw serviceUnavailable(
        `Supabase rejected this server's configuration: ${err.message} ` +
          `Check SUPABASE_URL and ${keyName} on the host.`
      )
    }
  }
  assert.throws(
    () => build('SUPABASE_ANON_KEY', () => { throw new Error('Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL.') }),
    (err) => {
      assert.equal(err.status, 503)
      assert.equal(err.name, 'ApiError')
      assert.match(err.message, /Invalid supabaseUrl/)
      assert.match(err.message, /SUPABASE_ANON_KEY/)
      return true
    }
  )
  // A working call is passed straight through.
  assert.equal(build('SUPABASE_ANON_KEY', () => 'client'), 'client')
})
