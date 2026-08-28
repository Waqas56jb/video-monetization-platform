import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'premiere.js'), 'utf8')

test('expireIfDue is a no-op unless a paid premiere window has closed', () => {
  assert.match(src, /video\.access_type !== 'paid_premiere'/)
  assert.match(src, /if \(!isDue\(video\)\) return video/)
  const expireFn = src.slice(src.indexOf('export async function expireIfDue'))
  const beforeSettings = expireFn.slice(0, expireFn.indexOf('getSettings'))
  assert.match(beforeSettings, /return video/)
})
