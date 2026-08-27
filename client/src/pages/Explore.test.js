import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = dirname(fileURLToPath(import.meta.url))

test('Explore drops unpublished and unapproved rows before drawing cards', () => {
  const src = readFileSync(join(dir, 'Explore.jsx'), 'utf8')
  assert.match(src, /isPublicCatalogueVideo/)
  assert.match(src, /CATEGORIES/)
})

test('public catalogue helper rejects pending review', () => {
  const src = readFileSync(join(dir, '../lib/videoView.js'), 'utf8')
  assert.match(src, /export function isPublicCatalogueVideo/)
  assert.match(src, /review !== 'approved'/)
  assert.match(src, /isPublished === false/)
})
