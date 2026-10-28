/**
 * Milestone 3, preview control: "short paid videos must not leak".
 *
 * Measured on production 2026-10-28: the public promo clip was
 * min(60, duration − 1), so a 57 s paid video with a 15 s preview had a
 * public 56 s clip, and a creator's "no preview" (0 s) became a 5-minute
 * signed preview clip.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { promoClipSeconds } from './playback.routes.js'

const v = (access_type, duration_seconds, free_preview_seconds) => ({ access_type, duration_seconds, free_preview_seconds })

test('a paid video\'s public promo never runs past its free preview', () => {
  assert.equal(promoClipSeconds(v('ppv_forever', 57, 15)), 15, 'Lisu: was 56 s')
  assert.equal(promoClipSeconds(v('ppv_forever', 13, 4)), 4)
  assert.equal(promoClipSeconds(v('paid_premiere', 60, 5)), 5)
  assert.equal(promoClipSeconds(v('ppv_forever', 653, 217)), 60, 'long preview: still capped at 60 s')
  assert.equal(promoClipSeconds(v('ppv_forever', 57, 50)), 19, 'preview itself capped at a third of the film')
})

test('no preview on a paid video means no promo clip; unknown length means none', () => {
  assert.equal(promoClipSeconds(v('ppv_forever', 653, 0)), 0)
  assert.equal(promoClipSeconds(v('paid_premiere', 300, null)), 0)
  assert.equal(promoClipSeconds(v('ppv_forever', 0, 30)), 0)
  assert.equal(promoClipSeconds(v('ppv_forever', null, 30)), 0)
})

test('free-with-ads videos keep the 60 s promo, never the whole video', () => {
  assert.equal(promoClipSeconds(v('free_with_ads', 653, 0)), 60)
  assert.equal(promoClipSeconds(v('free_with_ads', 30, 0)), 29)
  assert.equal(promoClipSeconds(v('free_with_ads', 1, 0)), 1)
})

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const playback = read('./playback.routes.js')
const share = read('./share.routes.js')

test('locked + no preview signs nothing; 0 s is never turned into 300 s', () => {
  const locked = playback.slice(playback.indexOf('No free preview (the creator chose 0 s)'), playback.indexOf('const previewUid = video.preview_uid || null'))
  assert.match(locked, /noPreview: true/)
  assert.doesNotMatch(locked, /signPlaybackToken/)
  assert.doesNotMatch(playback, /free_preview_seconds \|\| 300/)
  assert.match(playback, /if \(end <= 0 && duration > 0 && video\.preview_uid\)/)
})

test('an over-long public clip is deleted and recut; share and the mp4 proxy only hand out a clip within the limit', () => {
  assert.match(playback, /have > socialEnd \+ 1\.25/)
  assert.match(playback, /cf\.deleteVideo\(old\)/)
  assert.match(playback, /if \(!video\.social_clip_uid && duration > 0 && socialEnd > 0\)/)
  assert.match(share, /const promoUid = capabilities\.cloudflareStream \? await safePromoClipUid\(video\) : null/)
  const mp4 = share.slice(share.indexOf("'/:id/clip.mp4'"))
  assert.match(mp4, /const promoUid = await safePromoClipUid\(video\)/)
  assert.doesNotMatch(mp4.slice(mp4.indexOf('safePromoClipUid')), /video\.social_clip_uid\b(?!,)/)
})
