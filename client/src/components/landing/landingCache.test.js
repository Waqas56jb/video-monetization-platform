import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))

test('Landing sections paint from cache then refetch', () => {
  for (const file of ['Hero.jsx', 'Trending.jsx', 'ForCreators.jsx', 'Testimonials.jsx', 'Features.jsx']) {
    const src = readFileSync(join(dir, file), 'utf8')
    assert.match(src, /readLanding/, `${file} should seed from landing cache`)
    assert.match(src, /landingFetcher/, `${file} should write landing cache`)
  }
})

test('useApi can seed from initialData without a loading flash', () => {
  const src = readFileSync(join(dir, '../../hooks/useApi.js'), 'utf8')
  assert.match(src, /initialData = null/)
  assert.match(src, /useState\(initialData\)/)
  assert.match(src, /initialData == null/)
})
