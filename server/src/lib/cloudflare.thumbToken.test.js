import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./cloudflare.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const share = readFileSync(new URL('./shareMeta.js', import.meta.url), 'utf8')

test('thumbnail tokens are stable inside a 6-hour window, so one poster URL is reused everywhere', () => {
  assert.match(src, /export const THUMBNAIL_TOKEN_BUCKET = 6 \* 3600/)
  assert.match(src, /signPlaybackToken\(uid, \{ expiresInSeconds, bucketSeconds: THUMBNAIL_TOKEN_BUCKET \}\)/)
  // The window start is what gets signed, and expiry counts from the window's END.
  assert.match(src, /const now = bucketSeconds > 0 \? real - \(real % bucketSeconds\) : real/)
  assert.match(src, /exp: now \+ \(bucketSeconds > 0 \? bucketSeconds : 0\) \+ expiresInSeconds,/)
  // Playback tokens (the film itself) are NOT bucketed — only thumbnails ask for it.
  const playbackCalls = src.replace(/export function signPlaybackToken\([^)]*\)/, '').match(/signPlaybackToken\([^)]*\)/g) || []
  assert.ok(playbackCalls.every((c) => !/bucketSeconds/.test(c) || /THUMBNAIL_TOKEN_BUCKET/.test(c)))
})

test('share-meta carries the poster and shape so the first HTML can draw the player box', () => {
  assert.match(share, /thumbnailUrl: thumbnailFor\(video\),/)
  assert.match(share, /width: video\.width \|\| null,/)
  assert.match(share, /height: video\.height \|\| null,/)
})
