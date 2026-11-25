import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { autoRecover, QUIET_RESET_MS } from './autoRecover.js'

/** A fake window/document whose timers and events the test fires by hand. */
function fakeEnv({ online = true } = {}) {
  const listeners = {}
  const timers = []
  const on = (t, f) => ((listeners[t] ||= new Set()).add(f))
  const off = (t, f) => listeners[t]?.delete(f)
  const win = {
    navigator: { onLine: online },
    addEventListener: on,
    removeEventListener: off,
    setTimeout: (f, ms) => (timers.push({ f, ms }), timers.length),
    clearTimeout: (id) => (timers[id - 1] = null),
  }
  const doc = { visibilityState: 'visible', addEventListener: on, removeEventListener: off }
  const fire = async (t) => { for (const f of [...(listeners[t] || [])]) await f() }
  const tick = async () => { const t = timers.shift(); if (t) await t.f(); return t?.ms }
  return { win, doc, fire, tick, timers, listeners }
}
const shared = () => ({ step: 0, lastAt: 0 })

test('coming back online reloads the screen at once', async () => {
  const env = fakeEnv()
  let calls = 0
  autoRecover(() => { calls++ }, { ...env, shared: shared() })
  await env.fire('online')
  assert.equal(calls, 1)
})

test('returning to the tab reloads; a hidden tab does not', async () => {
  const env = fakeEnv()
  let calls = 0
  autoRecover(() => { calls++ }, { ...env, shared: shared() })
  env.doc.visibilityState = 'hidden'
  await env.fire('visibilitychange')
  assert.equal(calls, 0)
  env.doc.visibilityState = 'visible'
  await env.fire('visibilitychange')
  assert.equal(calls, 1)
})

test('timed retries back off and stop; the device being offline skips the request', async () => {
  const env = fakeEnv()
  let calls = 0
  autoRecover(async () => { calls++; throw new Error('still down') }, { ...env, shared: shared(), delays: [4, 10, 20] })
  const waits = []
  for (let i = 0; i < 5; i++) { const ms = await env.tick(); if (ms) waits.push(ms) }
  assert.deepEqual(waits, [4, 10, 20], 'bounded — never a loop')
  assert.equal(calls, 3)

  const off = fakeEnv({ online: false })
  let offCalls = 0
  autoRecover(() => { offCalls++ }, { ...off, shared: shared() })
  await off.tick()
  assert.equal(offCalls, 0, 'no request while the device says it is offline')
})

test('a box that is remounted by every failed retry continues the same schedule, not a fresh one', async () => {
  const s = shared()
  let t = 1_000_000
  const now = () => t
  const a = fakeEnv()
  const stopA = autoRecover(() => {}, { ...a, shared: s, now, delays: [4, 10, 20] })
  assert.equal(await a.tick(), 4)
  stopA()
  const b = fakeEnv()
  autoRecover(() => {}, { ...b, shared: s, now, delays: [4, 10, 20] })
  assert.equal(b.timers[0].ms, 10, 'continues from where the last box left off')
  t += QUIET_RESET_MS + 1
  const c = fakeEnv()
  autoRecover(() => {}, { ...c, shared: s, now, delays: [4, 10, 20] })
  assert.equal(c.timers[0].ms, 4, 'starts over after a quiet spell')
})

test('cleanup removes every listener and the pending timer', async () => {
  const env = fakeEnv()
  let calls = 0
  const stop = autoRecover(() => { calls++ }, { ...env, shared: shared() })
  stop()
  await env.fire('online')
  await env.fire('focus')
  assert.equal(calls, 0)
  assert.equal(env.timers.filter(Boolean).length, 0)
})

test('every "Could not load this" box with a retry button uses it', () => {
  const src = readFileSync(new URL('../components/ui/States.jsx', import.meta.url), 'utf8')
  assert.match(src, /autoRecover\(\(\) => retryRef\.current\?\.\(\)\)/)
})
