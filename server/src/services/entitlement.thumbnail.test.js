import { test } from 'node:test'
import assert from 'node:assert/strict'
import { studioThumbnailFor, thumbnailFor, publicVideo } from './entitlement.js'

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

test('public video carries source size so Watch can size the player', () => {
  const json = publicVideo({
    id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    slug: 'phone-clip',
    title: 'Phone clip',
    duration_seconds: 12,
    width: 1080,
    height: 1920,
    access_type: 'ppv_forever',
    price_tzs: 1000,
    free_preview_seconds: 4,
  })
  assert.equal(json.width, 1080)
  assert.equal(json.height, 1920)
  assert.equal(json.orientation, 'portrait')
})
