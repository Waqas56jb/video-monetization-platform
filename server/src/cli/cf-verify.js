#!/usr/bin/env node
/**
 * Prove the whole Cloudflare Stream pipeline works, against the live account.
 *
 *   npm run cf:verify                 use the bundled sample clip
 *   npm run cf:verify /path/to.mp4    use your own file
 *
 * A real file is uploaded through the same one-time URL a creator browser
 * would use, waited on while Cloudflare encodes it, played back through a
 * signed token, clipped, and then deleted again so it costs nothing. Nothing
 * here is stubbed, and it cleans up after itself.
 *
 * Run it whenever the Cloudflare account or token changes — it answers the
 * question 'is video working?' in about a minute.
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  createDirectUpload,
  getVideo,
  createClip,
  signPlaybackToken,
  playbackUrls,
  deleteVideo,
} from '../lib/cloudflare.js'
import { env, capabilities } from '../config/env.js'

const SAMPLE = process.argv[2] || process.env.SAMPLE

/**
 * Something to upload. A real file if one was named, otherwise a small public
 * test clip fetched on the spot — this check needs the network anyway, and
 * shipping a few megabytes of video in the repository to run it would be silly.
 */
async function sampleFile() {
  if (SAMPLE) {
    if (!fs.existsSync(SAMPLE)) throw new Error(`No such file: ${SAMPLE}`)
    return { bytes: fs.readFileSync(SAMPLE), name: path.basename(SAMPLE) }
  }
  console.log('  no file given — fetching a small test clip…')
  const res = await fetch('https://download.samplelib.com/mp4/sample-10s.mp4')
  if (!res.ok) {
    throw new Error(
      `Could not fetch a test clip (HTTP ${res.status}). Pass your own file: npm run cf:verify path/to.mp4`
    )
  }
  return { bytes: Buffer.from(await res.arrayBuffer()), name: 'sample-10s.mp4' }
}

let pass = 0
let fail = 0
const notes = []
const ok = (n, extra = '') => { pass++; console.log(`  PASS  ${n}${extra ? '  — ' + extra : ''}`) }
const bad = (n, why) => { fail++; notes.push(`${n}: ${why}`); console.log(`  FAIL  ${n}  — ${why}`) }
const check = (n, cond, why = '') => (cond ? ok(n) : bad(n, why))

console.log('\n=== Cloudflare Stream, live account ===\n')
console.log(`  account: ${env.cloudflare.accountId}`)
console.log(`  signed playback configured: ${capabilities.signedPlayback}\n`)

check('Stream is enabled on this account', capabilities.cloudflareStream, 'no account id or token')
check('a playback signing key is configured', capabilities.signedPlayback, 'CLOUDFLARE_STREAM_KEY_ID / PEM missing')

let uid = null

try {
  /* -------------------------------------------------- 1. direct upload URL */
  const upload = await createDirectUpload({
    maxDurationSeconds: 300,
    creatorId: 'mtonyo-pipeline-test',
    meta: { name: 'MTONYO+ pipeline test', probe: 'true' },
  })
  uid = upload.uid
  check('Cloudflare issues a direct-upload URL', Boolean(upload.uploadUrl && upload.uid), JSON.stringify(upload))
  check(
    'the upload URL is a one-time Cloudflare address',
    /^https:\/\/upload\.cloudflarestream\.com\//.test(upload.uploadUrl || ''),
    upload.uploadUrl
  )
  console.log(`        uid: ${uid}`)

  /* --------------------------------------- 2. upload the file, as a browser would */
  const { bytes, name } = await sampleFile()
  console.log(`\n  uploading ${(bytes.length / 1024 / 1024).toFixed(1)} MB …`)

  const form = new FormData()
  form.append('file', new Blob([bytes], { type: 'video/mp4' }), name)

  const res = await fetch(upload.uploadUrl, { method: 'POST', body: form })
  check('the file uploads', res.ok, `HTTP ${res.status} ${await res.text().catch(() => '')}`)

  /* ---------------------------------------------------- 3. wait for encoding */
  console.log('\n  waiting for Cloudflare to encode …')
  let video = null
  const startedAt = Date.now()
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 5000))
    video = await getVideo(uid)
    const pct = video?.status?.pctComplete ?? '0'
    process.stdout.write(`\r    ${video?.status?.state ?? 'unknown'} ${pct}%   `)
    if (video?.readyToStream || video?.status?.state === 'error') break
  }
  console.log('')

  const secs = Math.round((Date.now() - startedAt) / 1000)
  check('Cloudflare finishes encoding', video?.readyToStream === true, JSON.stringify(video?.status))
  ok('encoding time', `${secs}s`)

  check('the duration comes back', Number(video?.duration) > 0, String(video?.duration))
  check('a thumbnail is generated', Boolean(video?.thumbnail), video?.thumbnail || 'none')
  check(
    'playback is locked behind a signature',
    video?.requireSignedURLs === true,
    'requireSignedURLs is false — anyone with the uid could watch it'
  )
  console.log(`        duration: ${video?.duration}s · ${video?.input?.width}x${video?.input?.height}`)

  /* --------------------------------------------------- 4. signed playback */
  const token = signPlaybackToken(uid, { expiresInSeconds: 600 })
  check('a signed playback token is produced', typeof token === 'string' && token.split('.').length === 3, String(token).slice(0, 40))

  const urls = playbackUrls(token)
  check('an HLS URL is built from the token', /\.m3u8$/.test(urls.hls || ''), urls.hls)

  const manifest = await fetch(urls.hls)
  const body = await manifest.text()
  check('the signed HLS manifest actually plays', manifest.ok && body.includes('#EXTM3U'), `HTTP ${manifest.status} ${body.slice(0, 120)}`)

  // The whole point of signing: the bare uid must NOT work.
  const bare = await fetch(`https://customer-${'x'}.cloudflarestream.com/${uid}/manifest/video.m3u8`).catch(() => null)
  const unsigned = await fetch(urls.hls.replace(token, uid))
  check(
    'the same URL without a signature is refused',
    !unsigned.ok,
    `unsigned playback returned HTTP ${unsigned.status} — the paywall would leak`
  )

  const expired = signPlaybackToken(uid, { expiresInSeconds: -60 })
  const expiredRes = await fetch(playbackUrls(expired).hls)
  check('an expired token is refused', !expiredRes.ok, `HTTP ${expiredRes.status}`)

  /* ------------------------------------------------------------ 5. clipping */
  console.log('\n  cutting the free preview clip …')
  const previewSeconds = Math.min(5, Math.floor(Number(video.duration) / 2))
  const clip = await createClip({
    uid,
    startSeconds: 0,
    endSeconds: previewSeconds,
    requireSignedURLs: false,
    name: 'MTONYO+ free preview',
  })
  check('a preview clip is created', Boolean(clip?.uid), JSON.stringify(clip))
  console.log(`        clip uid: ${clip?.uid}`)

  const social = await createClip({
    uid,
    startSeconds: 0,
    endSeconds: Math.min(3, previewSeconds),
    requireSignedURLs: false,
    name: 'MTONYO+ social clip',
  })
  check('a shareable social clip is created', Boolean(social?.uid), JSON.stringify(social))

  /* ------------------------------------------------------------ 6. cleanup */
  console.log('\n  cleaning up …')
  for (const id of [clip?.uid, social?.uid, uid].filter(Boolean)) {
    await deleteVideo(id).catch((e) => console.log(`    could not delete ${id}: ${e.message}`))
  }
  const gone = await getVideo(uid).catch(() => null)
  check('the test video is removed from the account', !gone, 'it is still there — storage minutes would be consumed')
} catch (err) {
  bad('the pipeline runs without throwing', err.message)
  if (uid) await deleteVideo(uid).catch(() => {})
}

console.log(`\n=== ${pass} passed, ${fail} failed ===\n`)
if (notes.length) {
  console.log('failures:')
  notes.forEach((n) => console.log('  · ' + n))
  console.log('')
}
process.exit(fail ? 1 : 0)
