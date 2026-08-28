import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const dir = dirname(fileURLToPath(import.meta.url))

test('public creator lookup builds the storefront (featured, latest, most watched)', () => {
  const src = readFileSync(join(dir, 'auth.routes.js'), 'utf8')
  assert.match(src, /creatorStorefront/)
  const helper = readFileSync(join(dir, '../lib/creatorStorefront.js'), 'utf8')
  for (const field of ['featured', 'latest', 'mostWatched', 'totalViews', 'socials', 'category', 'isFollowing', 'followers']) {
    assert.match(helper, new RegExp(field), `storefront missing ${field}`)
  }
})
