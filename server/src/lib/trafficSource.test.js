import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeTrafficSource, TRAFFIC_SOURCES } from './trafficSource.js'

test('known channels pass, anything else is "other", nothing is "not recorded"', () => {
  for (const s of TRAFFIC_SOURCES) assert.equal(normalizeTrafficSource({ source: s }).source, s)
  assert.equal(normalizeTrafficSource({ source: 'WhatsApp' }).source, 'whatsapp')
  assert.equal(normalizeTrafficSource({ source: 'myspace' }).source, 'other')
  assert.deepEqual(normalizeTrafficSource(null), { source: null, campaign: null, referrer: null })
  assert.deepEqual(normalizeTrafficSource('whatsapp'), { source: null, campaign: null, referrer: null })
  assert.equal(normalizeTrafficSource({ source: 42 }).source, null)
})

test('hostile or oversized values are cut down to harmless short strings', () => {
  const n = normalizeTrafficSource({ source: "whatsapp'; drop table payments;--", campaign: '<img src=x onerror=1>' + 'z'.repeat(500), referrer: 'https://evil.example/path?token=abc' })
  assert.equal(n.source, 'other')
  assert.match(n.campaign, /^[a-z0-9._-]+$/)
  assert.ok(n.campaign.length <= 80)
  assert.equal(n.referrer, 'evil.example', 'host only')
  assert.equal(normalizeTrafficSource({ referrer: 'android-app://com.whatsapp/' }).referrer, 'com.whatsapp')
})
