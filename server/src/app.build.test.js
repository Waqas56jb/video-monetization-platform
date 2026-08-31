import { test } from 'node:test'
import assert from 'node:assert/strict'

/**
 * X-Build must name the commit that is actually answering.
 *
 * This is asserted by booting the app and reading the header off a real
 * response, not by matching the source. A source-text test would have passed
 * happily through the whole Railway move while the header sat at `dev` — the
 * variable name changed, the code did not, and the string `VERCEL_GIT_COMMIT_SHA`
 * was still right there in the file.
 *
 * Each case re-imports app.js under a fresh query string so the module runs
 * again with different environment; BUILD is computed once at import, which is
 * the point of the header (it cannot drift mid-process) and the reason it cannot
 * be re-read any other way.
 */
const SHA = 'ab12cd34ef56789012345678901234567890abcd'

async function buildHeader(env) {
  const saved = {
    RAILWAY_GIT_COMMIT_SHA: process.env.RAILWAY_GIT_COMMIT_SHA,
    VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA,
  }
  for (const key of Object.keys(saved)) {
    if (env[key] === undefined) delete process.env[key]
    else process.env[key] = env[key]
  }

  // Cache-bust so the module body — and so BUILD — is evaluated again.
  const { default: app } = await import(`./app.js?build=${buildHeader.n++}`)
  const server = app.listen(0)
  try {
    await new Promise((resolve) => server.once('listening', resolve))
    // `/` is a static JSON route: no database, no auth, no rate limiter.
    const res = await fetch(`http://127.0.0.1:${server.address().port}/`)
    return res.headers.get('x-build')
  } finally {
    await new Promise((resolve) => server.close(resolve))
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}
buildHeader.n = 0

test('X-Build reports the Railway commit', async () => {
  const header = await buildHeader({ RAILWAY_GIT_COMMIT_SHA: SHA })
  assert.equal(header, 'ab12cd3')
})

test('Railway wins over Vercel when both are set', async () => {
  // Not hypothetical while the frontends still build on Vercel: a stray value
  // in the wrong project would otherwise make the API claim a frontend's commit.
  const header = await buildHeader({
    RAILWAY_GIT_COMMIT_SHA: SHA,
    VERCEL_GIT_COMMIT_SHA: '9999999999999999999999999999999999999999',
  })
  assert.equal(header, 'ab12cd3')
})

test('Vercel is still read, so a rollback there is not blind', async () => {
  const header = await buildHeader({ VERCEL_GIT_COMMIT_SHA: SHA })
  assert.equal(header, 'ab12cd3')
})

test('X-Build falls back to dev, and is never absent', async () => {
  const header = await buildHeader({})
  assert.equal(header, 'dev')
})
