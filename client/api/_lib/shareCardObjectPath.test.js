/**
 * The three places that name a share-card object must name the same one.
 *
 * They are: the uploader (server/src/lib/shareCardStorage.js), the published URL
 * (server/src/lib/shareMeta.js) and the reader (client/api/og.js). They were
 * three separate template literals in two separate deployables, and the reader
 * and the URL had already drifted into pointing at different objects. Nothing
 * broke, because the uploader happens to write both names — but a single edit to
 * either one would have broken the WhatsApp poster path with no error anywhere,
 * just a card that quietly stops appearing.
 *
 * The client copy of the namer exists because client/api/og.js deploys with
 * client/ as its build root, so it cannot import from server/. This test is what
 * makes that copy safe: it loads both files and requires them to agree.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import * as clientPaths from './shareCardObjectPath.js'
import * as serverPaths from '../../../server/src/lib/shareCardObjectPath.js'

/** A real row: slug plus the sha1-derived sourceKey shareMeta produces. */
const SLUG = 'live-at-arusha-full-set'
const SOURCE_KEY = 'c5ce44811b'

test('the client and server namers are the same function', () => {
  const cases = [
    [SLUG, SOURCE_KEY],
    ['how-to-cook-pilau-properly', 'abc1234567'],
    [SLUG, ''],
    [SLUG, null],
    [SLUG, '../../etc/passwd'],
    ['', SOURCE_KEY],
  ]

  for (const [slug, key] of cases) {
    const where = `slug=${JSON.stringify(slug)} key=${JSON.stringify(key)}`
    assert.equal(clientPaths.latestCardPath(slug), serverPaths.latestCardPath(slug), where)
    assert.equal(clientPaths.versionedCardPath(slug, key), serverPaths.versionedCardPath(slug, key), where)
    assert.equal(clientPaths.readCardPath(slug, key), serverPaths.readCardPath(slug, key), where)
    assert.deepEqual(clientPaths.writeCardPaths(slug, key), serverPaths.writeCardPaths(slug, key), where)
  }

  assert.equal(clientPaths.SHARE_CARD_BUCKET, serverPaths.SHARE_CARD_BUCKET)
})

test('what the uploader writes is what the reader asks for', () => {
  // The uploader writes both objects; the reader must ask for one of those two,
  // never a third name.
  const written = serverPaths.writeCardPaths(SLUG, SOURCE_KEY)
  assert.equal(written.latest, `${SLUG}.jpg`)
  assert.equal(written.versioned, `${SLUG}-${SOURCE_KEY}.jpg`)

  // Holding the key, the reader takes the immutable object — the one that
  // cannot be stale after a rebuild.
  assert.equal(clientPaths.readCardPath(SLUG, SOURCE_KEY), written.versioned)
  // Without a key there is nothing better to go on than "latest".
  assert.equal(clientPaths.readCardPath(SLUG, ''), written.latest)
})

test('the published URL points at an object the uploader actually wrote', () => {
  // shareMeta builds publicStorageCardUrl from versionedCardPath, so the tail of
  // that URL must be exactly the versioned object.
  const shareMeta = readFileSync(
    fileURLToPath(new URL('../../../server/src/lib/shareMeta.js', import.meta.url)),
    'utf8'
  )
  assert.match(shareMeta, /versionedCardPath\(slug, sourceKey\)/)
  assert.match(shareMeta, /\$\{SHARE_CARD_BUCKET\}\/\$\{path\}/)
  assert.doesNotMatch(
    shareMeta,
    /share-cards\/\$\{slug\}-\$\{sourceKey\}\.jpg/,
    'the literal must be gone, or it can drift from the namer again'
  )

  // And the uploader must go through the namer rather than its own literals.
  const storage = readFileSync(
    fileURLToPath(new URL('../../../server/src/lib/shareCardStorage.js', import.meta.url)),
    'utf8'
  )
  assert.match(storage, /writeCardPaths\(slug, sourceKey\)/)
  assert.doesNotMatch(storage, /putObject\(`\$\{slug\}\.jpg`/)
  assert.doesNotMatch(storage, /putObject\(`\$\{slug\}-\$\{sourceKey\}\.jpg`/)
})

test('og.js reads the versioned object and cannot be pushed off the bucket path', () => {
  const og = readFileSync(fileURLToPath(new URL('../og.js', import.meta.url)), 'utf8')
  assert.match(og, /readCardPath\(slug, sourceKey\)/)
  assert.match(og, /req\.query && req\.query\.v/)
  assert.doesNotMatch(og, /share-cards\/\$\{encodeURIComponent\(slug\)\}\.jpg/)

  // A sourceKey arrives from a query string, so it must never reach a path
  // unvalidated — a traversal attempt falls back to "latest" rather than
  // escaping the bucket prefix.
  assert.equal(clientPaths.versionedCardPath(SLUG, '../../secret'), null)
  assert.equal(clientPaths.readCardPath(SLUG, '../../secret'), `${SLUG}.jpg`)
  assert.equal(clientPaths.isValidSourceKey('a'.repeat(41)), false)
})
