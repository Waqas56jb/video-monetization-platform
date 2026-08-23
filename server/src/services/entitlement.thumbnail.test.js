import { test } from 'node:test'
import assert from 'node:assert/strict'
import { studioThumbnailFor, thumbnailFor } from './entitlement.js'

const draft = {
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  cloudflare_uid: 'cf123',
  is_published: false,
  review_status: 'draft',
  deleted_at: null,
}

test('studio thumbnail is always addressable for a draft upload', () => {
  const url = studioThumbnailFor(draft)
  assert.ok(url)
  assert.match(url, /^(\/api\/playback\/|https:\/\/videodelivery\.net\/)/)
})

test('custom cover wins over the automatic frame', () => {
  const url = studioThumbnailFor({
    ...draft,
    custom_thumbnail_url: 'https://cdn.example.com/my-cover.jpg',
  })
  assert.equal(url, 'https://cdn.example.com/my-cover.jpg')
})

test('public listing still uses the playback route', () => {
  const url = thumbnailFor({
    ...draft,
    is_published: true,
    review_status: 'approved',
  })
  assert.match(url, /^\/api\/playback\//)
})
