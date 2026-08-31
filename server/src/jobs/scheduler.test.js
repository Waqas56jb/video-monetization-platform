/**
 * The scheduler must not fire anywhere except a Railway environment.
 *
 * These jobs write to the production database — one converts paid videos to free,
 * the other rebuilds share cards. A developer running `npm run dev` against the
 * production DATABASE_URL, or a test run, must never trigger either.
 *
 * The schedules themselves are asserted because they moved house. They were Vercel
 * Cron entries in server/vercel.json, and Vercel Cron is a property of a Vercel
 * deployment — so the move to Railway stopped both, silently. Pinning them here
 * means the repository states the schedule rather than a dashboard nobody opens.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { JOBS, schedulingEnabled, startScheduler } from './scheduler.js'

function withEnv(vars, run) {
  const saved = {}
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k]
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  try {
    return run()
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
}

test('scheduling is off unless this is a Railway environment', () => {
  withEnv({ RAILWAY_ENVIRONMENT: undefined, DISABLE_CRON: undefined }, () => {
    assert.equal(schedulingEnabled(), false, 'a laptop or CI run must never schedule production work')
    assert.deepEqual(startScheduler(), [], 'and must not create tasks')
  })
})

test('DISABLE_CRON turns it off on Railway too, without a redeploy', () => {
  withEnv({ RAILWAY_ENVIRONMENT: 'production', DISABLE_CRON: '1' }, () => {
    assert.equal(schedulingEnabled(), false)
    assert.deepEqual(startScheduler(), [])
  })
})

test('on Railway, both jobs are scheduled', () => {
  withEnv({ RAILWAY_ENVIRONMENT: 'production', DISABLE_CRON: undefined }, () => {
    assert.equal(schedulingEnabled(), true)
    const tasks = startScheduler()
    try {
      assert.equal(tasks.length, JOBS.length)
    } finally {
      // Otherwise the timers hold the test runner open.
      tasks.forEach((t) => t.stop())
    }
  })
})

test('the schedules match what Vercel Cron used to run', () => {
  // Same wall clock, so nothing shifts by moving host. Vercel Cron ran in UTC and
  // the scheduler pins Etc/UTC for the same reason.
  const by = Object.fromEntries(JOBS.map((j) => [j.name, j.schedule]))
  assert.equal(by['premiere-expiry'], '0 2 * * *')
  assert.equal(by['share-cards-stale'], '15 3 * * *')
})

test('the HTTP job endpoints survive, so an external scheduler stays possible', async () => {
  const { readFileSync } = await import('node:fs')
  const { fileURLToPath } = await import('node:url')
  const routes = readFileSync(fileURLToPath(new URL('../routes/index.js', import.meta.url)), 'utf8')
  assert.match(routes, /\/jobs\/premiere-expiry/)
  assert.match(routes, /assertCronSecret/)
})
