import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(dir, 'premiere.js'), 'utf8')

/**
 * The cron and expireIfDue must convert ONLY premiere_to_free titles. Before
 * migration 036 the only guard was `access_type = 'paid_premiere'` — so an
 * admin who deliberately pinned a video to `exclusive` (to stop it
 * converting on its own) would still have it swept into Free + Ads by the
 * next nightly run, or the next person who opened it.
 */
test('isDue refuses anything but release_model = premiere_to_free', () => {
  const isDueFn = src.slice(src.indexOf('function isDue'), src.indexOf('async function switchOne'))
  assert.match(isDueFn, /release_model !== 'premiere_to_free'/)
})

test("switchOne's own UPDATE re-checks release_model, not just access_type", () => {
  const switchOneFn = src.slice(src.indexOf('async function switchOne'), src.indexOf('export async function expireIfDue'))
  assert.match(switchOneFn, /and access_type = 'paid_premiere'/)
  assert.match(switchOneFn, /and release_model = 'premiere_to_free'/)
})

test('the nightly sweep only selects premiere_to_free rows, and reads the column to prove it', () => {
  const sweepFn = src.slice(src.indexOf('export async function runPremiereExpiry'))
  assert.match(sweepFn, /select id, title, creator_id, premiere_ends_at, release_model/)
  assert.match(sweepFn, /and release_model = 'premiere_to_free'/)
})
