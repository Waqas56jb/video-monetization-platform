/**
 * crawler_hits keeps every request — the rule that discarded `human` rows is
 * gone, and the columns that make one row a complete account of one request
 * exist end to end: migration, route, insert.
 *
 * Source-text on the write path, deliberately: `recordCrawlerHit` opens a
 * database connection the moment it decides to record, and a test that
 * exercised it for real would write a row to whatever DATABASE_URL is in
 * server/.env — which is production on this machine.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { classifyCrawler } from './crawlerLog.js'

const dir = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(dir, 'crawlerLog.js'), 'utf8')
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

test('a human User-Agent is no longer a reason to drop the row', () => {
  assert.doesNotMatch(code, /crawler === 'human'\)\s*return/)
  // The only thing still absorbed: a body that says nothing at all about who asked.
  assert.match(code, /if \(userAgent == null && headers == null\) return/)
})

test('the insert carries the whole request shape', () => {
  for (const col of ['method', 'doc', 'ip', 'country', 'city', 'headers', 'build', 'decision']) {
    assert.match(code, new RegExp(`\\b${col}\\b`), `${col} is written`)
  }
  assert.match(code, /\$15::jsonb/, 'headers land as jsonb, not text')
})

test('the migration adds those columns, and the route passes them through', () => {
  const migration = join(dir, '../db/migrations/039_crawler_hits_capture_all.sql')
  assert.ok(existsSync(migration), 'migration 039 exists')
  const sql = readFileSync(migration, 'utf8')
  for (const col of ['method', 'doc', 'ip', 'country', 'city', 'headers', 'build', 'decision']) {
    assert.match(sql, new RegExp(`add column if not exists ${col}\\s`), `039 adds ${col}`)
  }
  const route = readFileSync(join(dir, '../modules/share.routes.js'), 'utf8')
  for (const f of ['method: b.method', 'doc: b.doc', 'ip: b.ip', 'decision: b.decision', 'build: b.build']) {
    assert.ok(route.includes(f), `crawl-hit forwards ${f}`)
  }
  assert.match(route, /headers: b\.headers && typeof b\.headers === 'object' \? b\.headers : null/)
})

test('a proxied image fetch is recorded by the proxy, not twice', () => {
  const serve = readFileSync(join(dir, 'shareCardServe.js'), 'utf8')
  assert.match(serve, /req\.get\('x-mtonyo-proxy'\)/)
  assert.equal((serve.match(/if \(proxied\) return/g) || []).length, 2, 'both image branches stand down')
})

test('WhatsApp Desktop is named on its own', () => {
  assert.equal(
    classifyCrawler(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) WhatsApp/2.2412.54 Chrome/124.0.0.0 Electron/30.0.9 Safari/537.36'
    ),
    'whatsapp-desktop'
  )
  assert.equal(classifyCrawler('WhatsApp/2.23.20.0 N'), 'whatsapp-web')
  assert.equal(classifyCrawler('Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/128.0.0.0 Safari/537.36'), 'human')
})
