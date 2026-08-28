import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const dir = dirname(fileURLToPath(import.meta.url))

test('start and stop stay stable so RouteProgress cannot loop the bar', () => {
  const src = readFileSync(join(dir, 'ProgressContext.jsx'), 'utf8')
  assert.match(src, /useCallback\(\(\) => \{[\s\S]*setActive\(true\)[\s\S]*\}, \[\]\)/)
  assert.match(src, /useCallback\(\(\) => \{[\s\S]*setActive\(false\)[\s\S]*\}, \[\]\)/)
  assert.match(src, /8000/)
  assert.doesNotMatch(src, /start:\s*\(\)\s*=>\s*setActive\(true\)/)
})

test('RouteProgress depends only on the URL, not start/stop identity', () => {
  const src = readFileSync(join(dir, '../App.jsx'), 'utf8')
  const block = src.match(/function RouteProgress\(\) \{[\s\S]*?\n\}/)
  assert.ok(block, 'RouteProgress is missing')
  assert.match(block[0], /\[location\.pathname, location\.search\]/)
  assert.doesNotMatch(block[0], /\[location\.pathname, location\.search, start, stop\]/)
})
