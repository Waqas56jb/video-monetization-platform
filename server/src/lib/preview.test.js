import { test } from 'node:test'
import assert from 'node:assert/strict'
import { clampFreePreviewSeconds, maxFreePreviewSeconds } from './preview.js'

test('10:53 concert preview ceiling is 3:37 (217s)', () => {
  assert.equal(maxFreePreviewSeconds(653), 217)
  assert.equal(clampFreePreviewSeconds(300, 653), 217)
  assert.equal(clampFreePreviewSeconds(217, 653), 217)
})

test('UI and enforcement share the same clamp', () => {
  assert.equal(clampFreePreviewSeconds(500, 54), 18)
  assert.equal(clampFreePreviewSeconds(90, 180), 60)
  assert.equal(clampFreePreviewSeconds(600, 7200), 300)
})
