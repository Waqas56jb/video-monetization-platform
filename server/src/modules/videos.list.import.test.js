import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'videos.routes.js'), 'utf8')

test('Explore catalogue is only approved published videos', () => {
  assert.match(src, /const where = \[`v\.is_published = true`, `v\.review_status = 'approved'`, `v\.deleted_at is null`\]/)
})

test('category filter matches the stored upload category', () => {
  assert.match(src, /if \(category\) \{ params\.push\(category\); where\.push\(`v\.category = \$\$\{params\.length\}`\) \}/)
})

test('demo Nyerere sample is forced back to pending review if it was published', () => {
  const demo = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../cli/demo.js'), 'utf8')
  assert.match(demo, /Nyerere Day — Rehearsals \(awaiting review\)/)
  assert.match(demo, /stays in review — not on Explore/)
  assert.match(demo, /review_status = 'pending_review'/)
})
