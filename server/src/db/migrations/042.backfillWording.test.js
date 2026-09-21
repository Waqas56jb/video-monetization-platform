import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

/**
 * Client, 2026-09-21: "Please also remove the creator-facing text 'Creator
 * account created before applications existed.' That is internal/migration
 * language and should never appear to users." Seen in Super Admin ->
 * Creator Applications, filter: approved — the exact 9 creators migration
 * 020 backfilled for predating the review process.
 */
const dir = dirname(fileURLToPath(import.meta.url))
const migration = readFileSync(join(dir, '042_backfilled_application_wording.sql'), 'utf8')
const origin = readFileSync(join(dir, '020_creator_applications.sql'), 'utf8')

test('the internal migration string is the exact one 020 wrote, and 042 replaces every row carrying it', () => {
  assert.match(origin, /'Creator account created before applications existed\.'/)
  assert.match(migration, /where description = 'Creator account created before applications existed\.'/)
  assert.match(migration, /set description = '[^']+'/)
})

test('the replacement reads as an audit note, not as the creator\'s own claim about what they publish', () => {
  const replacement = migration.match(/set description = '([^']+)'/)[1]
  assert.match(replacement, /^No application on file/)
  assert.doesNotMatch(replacement, /I (will|plan to|make|publish)/i, 'never phrased as if the creator wrote it')
})
