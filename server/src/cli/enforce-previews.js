#!/usr/bin/env node
/**
 * Bring every video's clips inside the preview rule — once, after deploying it.
 *
 *   npm run previews:enforce            fix: recut / remove over-long clips
 *   npm run previews:enforce -- --dry   report only, change nothing
 *
 * A paid video's PUBLIC promo clip may not run past its free preview, and a
 * paid video with no preview has no preview or promo clip at all. The app
 * applies this lazily (on playback / share); this applies it to the whole
 * catalogue now, so no over-long public copy stays reachable. Same code path
 * as the app (ensureClips), so it is idempotent: a second run changes nothing.
 */
import { many, closePool } from '../db/pool.js'
import { ensureClips, promoClipSeconds } from '../modules/playback.routes.js'
import { getVideo } from '../lib/cloudflare.js'
import { clampFreePreviewSeconds } from '../lib/preview.js'

const dry = process.argv.includes('--dry')
const dur = async (uid) => (uid ? Number((await getVideo(uid).catch(() => null))?.duration ?? 0) : 0)

const rows = await many(
  `select id, title, access_type, duration_seconds, free_preview_seconds, preview_uid, social_clip_uid
     from videos where deleted_at is null and state = 'ready' order by created_at desc`
)
let bad = 0
for (const v of rows) {
  const promoLimit = promoClipSeconds(v)
  const previewLimit = clampFreePreviewSeconds(v.free_preview_seconds ?? 0, v.duration_seconds)
  const [promo, preview] = [await dur(v.social_clip_uid), await dur(v.preview_uid)]
  const promoBad = promo > 0 && (promoLimit <= 0 || promo > promoLimit + 1.25)
  const previewBad = v.access_type !== 'free_with_ads' && preview > 0 && (previewLimit <= 0 || preview > previewLimit + 1.25)
  if (!promoBad && !previewBad) continue
  bad++
  console.log(`${dry ? 'WOULD FIX' : 'fixing  '} ${v.title.slice(0, 40).padEnd(40)} promo ${promo.toFixed(0)}s→${promoLimit}s  preview ${preview.toFixed(0)}s→${previewLimit}s`)
  if (!dry) {
    const r = await ensureClips(v.id).catch((e) => ({ error: e.message }))
    if (r?.error) console.log(`   ! ${r.error}`)
  }
}
console.log(`\n${rows.length} videos checked, ${bad} ${dry ? 'need fixing' : 'fixed'}.`)
await closePool()
