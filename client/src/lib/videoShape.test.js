import { test } from 'node:test'
import assert from 'node:assert/strict'
import { videoOrientation, videoShape, playerStageWidth } from './videoShape.js'

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
  assert.equal(videoShape(320, 240).aspect, '320 / 240')
  assert.equal(videoShape(320, 240).orientation, 'landscape')
})

test('the Watch stage is the file rectangle, not a 16:9 card around it', () => {
  const wrap = 840
  const maxH = 700
  assert.equal(Math.round(playerStageWidth(16 / 9, maxH, wrap)), wrap)
  assert.equal(Math.round(playerStageWidth(320 / 240, maxH, wrap)), wrap)
  const portrait = playerStageWidth(886 / 1920, maxH, wrap)
  assert.ok(portrait < wrap * 0.55, `portrait stage should be a column, got ${portrait}`)
  assert.equal(Math.round(portrait), Math.round(maxH * (886 / 1920)))
})
