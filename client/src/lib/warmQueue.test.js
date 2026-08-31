import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createWarmQueue } from './warmQueue.js'

/**
 * Explore fired one playback request per visible card — six before any tap.
 * These pin the two properties that fixes it: a cap, and a queue that a
 * navigation can throw away without throwing away the thing being navigated to.
 */
const deferred = () => {
  let settle
  const promise = new Promise((res) => { settle = res })
  return { promise, settle }
}

test('never runs more than the cap at once', async () => {
  const q = createWarmQueue(2)
  const jobs = [deferred(), deferred(), deferred(), deferred()]
  jobs.forEach((j, i) => q.push(`k${i}`, () => j.promise))
  assert.deepEqual(q.stats(), { running: 2, waiting: 2 })

  jobs[0].settle()
  await jobs[0].promise
  await null
  assert.equal(q.stats().running, 2, 'a finished job is replaced, not left idle')
  assert.equal(q.stats().waiting, 1)
})

test('a navigation drops what has not started', () => {
  const q = createWarmQueue(2)
  const held = [deferred(), deferred()]
  q.push('a', () => held[0].promise)
  q.push('b', () => held[1].promise)
  let startedC = false
  q.push('c', () => { startedC = true; return Promise.resolve() })
  assert.equal(q.stats().waiting, 1)

  q.drop()
  assert.equal(q.stats().waiting, 0)
  assert.equal(startedC, false, 'a dropped job must never run')
})

test('the card being opened is spared from the drop', async () => {
  // The whole point: dropping the queue must not drop the one thing the page
  // is about to await, or it is fetched again a moment later.
  const q = createWarmQueue(2)
  const held = [deferred(), deferred()]
  q.push('a', () => held[0].promise)
  q.push('b', () => held[1].promise)
  let ranTarget = false
  q.push('target', () => { ranTarget = true; return Promise.resolve() })
  q.push('other', () => Promise.resolve('should not run'))

  q.drop('target')
  assert.equal(q.stats().waiting, 1, 'only the spared job remains')
  held[0].settle()
  await held[0].promise
  await null
  assert.equal(ranTarget, true)
})

test('a job that rejects still frees its slot', async () => {
  const q = createWarmQueue(1)
  let second = false
  q.push('bad', () => Promise.reject(new Error('network')))
  q.push('next', () => { second = true; return Promise.resolve() })
  await new Promise((r) => setTimeout(r, 5))
  assert.equal(second, true, 'a failed warm must not wedge the queue')
  assert.equal(q.stats().running, 0)
})

test('dropping an empty queue is harmless', () => {
  const q = createWarmQueue(2)
  q.drop()
  q.drop('anything')
  assert.deepEqual(q.stats(), { running: 0, waiting: 0 })
})
