import { test } from 'node:test'
import assert from 'node:assert/strict'
import { videoOrientation, dimensionsFromCloudflare } from './videoShape.js'

test('orientation follows the source pixels', () => {
  assert.equal(videoOrientation(1920, 1080), 'landscape')
  assert.equal(videoOrientation(1080, 1920), 'portrait')
  assert.equal(videoOrientation(1080, 1080), 'square')
  assert.equal(videoOrientation(0, 0), null)
  assert.equal(videoOrientation(null, 720), null)
})

test('Cloudflare ready payloads expose input width and height', () => {
  assert.deepEqual(dimensionsFromCloudflare({ input: { width: 1080, height: 1920 } }), {
    width: 1080,
    height: 1920,
  })
  assert.deepEqual(dimensionsFromCloudflare({ width: 1280, height: 720 }), {
    width: 1280,
    height: 720,
  })
  assert.deepEqual(dimensionsFromCloudflare({}), { width: null, height: null })
})
