import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { socialIcon, socialLabel } from '../lib/socialLinks.js'

const dir = dirname(fileURLToPath(import.meta.url))

test('public creator page is a storefront, not a name and a grid', () => {
  const src = readFileSync(join(dir, 'CreatorProfile.jsx'), 'utf8')
  for (const needle of [
    'Featured release',
    'Latest releases',
    'Most watched',
    'Full catalogue',
    'creator-socials',
    'creator-follow',
    'totalViews',
    'Follow',
  ]) {
    assert.match(src, new RegExp(needle), `missing ${needle}`)
  }
  assert.doesNotMatch(src, /All published videos/)
})

test('social links pick an icon from the host', () => {
  assert.equal(socialIcon('https://instagram.com/x'), 'instagram')
  assert.equal(socialIcon('https://youtube.com/watch?v=1'), 'youtube')
  assert.equal(socialLabel('https://www.tiktok.com/@x'), 'tiktok.com')
})
