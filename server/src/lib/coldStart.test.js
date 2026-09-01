import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')

/**
 * The Dublin-region assertion is gone with the host.
 *
 * It pinned `"regions": ["dub1"]` in server/vercel.json so the functions stayed
 * next to Supabase in eu-west-1. The API moved to Railway on 2026-08-31, where
 * region is a dashboard setting rather than a repository one — so there is
 * nothing here left to assert, and keeping a test that reads a file the host no
 * longer uses would be worse than deleting it: it would pass while meaning
 * nothing.
 *
 * What replaced it is the scheduler, which is the part that genuinely had to
 * come back into the repository — see jobs/scheduler.test.js. Locality to the
 * database is now checked by measurement rather than by config, and recorded in
 * RAILWAY-MOVE.md.
 */
test('the API still starts a long-running server on PORT', () => {
  // Railway runs `npm start`, so an entry point that only exports the app —
  // which is all a serverless host needs — would deploy cleanly and serve
  // nothing at all.
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  assert.equal(pkg.scripts.start, 'node src/index.js')
  const index = readFileSync(join(root, 'src/index.js'), 'utf8')
  assert.match(index, /app\.listen\(env\.port/)
  const env = readFileSync(join(root, 'src/config/env.js'), 'utf8')
  assert.match(env, /port: int\(process\.env\.PORT/)
})

test('share-meta does not load Sharp on the public GET path', () => {
  const src = readFileSync(join(root, 'src/lib/shareMeta.js'), 'utf8')
  // The builder pulls in Sharp and opentype. It may only ever be reached
  // dynamically, from a path that has already decided a card is missing.
  assert.doesNotMatch(src, /from ['"]\.\/buildShareCard\.js['"]/)
  assert.match(src, /import\(['"]\.\/buildShareCard\.js['"]\)/)
})

test('card status comes from the video row, not a second table', () => {
  // This used to require an import of shareCardCache, because the cheapest
  // answer available was a select there. Migration 030 put the boolean on
  // `videos`, so the cheapest answer is now no query at all — and requiring the
  // old import would force the round trip back.
  const src = readFileSync(join(root, 'src/lib/shareMeta.js'), 'utf8')
  /* Comments out first. The file explains in prose that it *used to* call
     readCardStatus, and a naive match on the identifier fails on that sentence —
     which is a test asserting its own documentation away. */
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
  assert.doesNotMatch(
    code,
    /readCardStatus/,
    'readCardStatus calls ensureShareCardTable, which issues three DDL statements'
  )
  assert.match(code, /card_ready \? 'ready' : 'building'/)

  // And the route that gates the player must select the column it now reads.
  const videos = readFileSync(join(root, 'src/modules/videos.routes.js'), 'utf8')
  assert.match(videos, /SELECT_PUBLIC_OWNED/, 'the single-video route joins the purchase itself')
  assert.match(videos, /_purchase_id/)
})

test('videos and playback do not statically import the share-card builder', () => {
  const videos = readFileSync(join(root, 'src/modules/videos.routes.js'), 'utf8')
  const playback = readFileSync(join(root, 'src/modules/playback.routes.js'), 'utf8')
  assert.doesNotMatch(videos, /from ['"]\.\.\/lib\/buildShareCard\.js['"]/)
  assert.match(videos, /import\(['"]\.\.\/lib\/buildShareCard\.js['"]\)/)
  assert.doesNotMatch(playback, /from ['"]\.\.\/lib\/buildShareCard\.js['"]/)
  assert.match(playback, /import\(['"]\.\.\/lib\/buildShareCard\.js['"]\)/)
})

test('cold-start routers are lazy except videos, playback, auth, ads, stats', () => {
  const src = readFileSync(join(root, 'src/routes/index.js'), 'utf8')
  assert.match(src, /lazyRouter\(\(\) => import\('\.\.\/modules\/payments\/payments\.routes\.js'\)\)/)
  assert.match(src, /lazyRouter\(\(\) => import\('\.\.\/modules\/admin\.routes\.js'\)\)/)
  assert.match(src, /\/jobs\/keep-warm/)
  assert.match(src, /warmJwks/)
  assert.match(src, /select 1/)
  assert.match(src, /from '\.\.\/modules\/videos\.routes\.js'/)
  assert.match(src, /from '\.\.\/modules\/playback\.routes\.js'/)
  assert.match(src, /from '\.\.\/modules\/auth\.routes\.js'/)
})

test('nodemailer is not imported at mailer boot', () => {
  const src = readFileSync(join(root, 'src/lib/mailer.js'), 'utf8')
  assert.doesNotMatch(src, /^import nodemailer from 'nodemailer'/m)
  assert.match(src, /await import\('nodemailer'\)/)
})

test('routes/index.js is valid ESM (block comments must not contain */)', async () => {
  await import('../routes/index.js')
})
