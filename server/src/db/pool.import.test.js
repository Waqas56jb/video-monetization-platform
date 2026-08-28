import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'pool.js'), 'utf8')

test('pg Pool is module-level, small, keepAlive, reused across invocations', () => {
  assert.match(src, /max:\s*3/)
  assert.match(src, /keepAlive:\s*true/)
  assert.match(src, /globalThis/)
  assert.match(src, /6543/)
  assert.match(src, /let pool = existingPool\(\)|let pool = null/)
})
