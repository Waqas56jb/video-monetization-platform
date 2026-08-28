import { test } from 'node:test'
import assert from 'node:assert/strict'
import { videoOrientation, videoShape } from './videoShape.js'

test('missing size falls back to landscape 16:9', () => {
  assert.equal(videoOrientation(0, 0), null)
  assert.deepEqual(videoShape(null, null), {
    orientation: 'landscape',
    aspect: '16 / 9',
    ratio: 16 / 9,
  })
})

test('portrait and square keep their own ratio', () => {
  assert.equal(videoShape(1080, 1920).orientation, 'portrait')
  assert.equal(videoShape(1080, 1920).aspect, '1080 / 1920')
  assert.equal(videoShape(1080, 1080).orientation, 'square')
  assert.equal(videoShape(1920, 1080).orientation, 'landscape')
})
