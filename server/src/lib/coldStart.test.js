import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')

test('API functions run in Dublin, next to eu-west-1', () => {
  const src = readFileSync(join(root, 'vercel.json'), 'utf8')
  assert.match(src, /"regions":\s*\[\s*"dub1"\s*\]/)
  assert.doesNotMatch(src, /\*\/5 \* \* \* \*/)
})

test('share-meta does not load Sharp on the public GET path', () => {
  const src = readFileSync(join(root, 'src/lib/shareMeta.js'), 'utf8')
  assert.doesNotMatch(src, /from ['"]\.\/buildShareCard\.js['"]/)
  assert.match(src, /from ['"]\.\/shareCardCache\.js['"]/)
  assert.match(src, /import\(['"]\.\/buildShareCard\.js['"]\)/)
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
