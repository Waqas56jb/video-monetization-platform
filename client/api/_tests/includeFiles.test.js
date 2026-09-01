/**
 * A function may only read files it is actually shipped.
 *
 * `vercel.json` decides what goes inside a serverless function via
 * `includeFiles`. Get it too wide and the function carries the whole site: a
 * real deployment measured `λ api/watch (942.56KB)` against ~22 KB of source,
 * because the glob was `dist/**` while the handler opens exactly one 4.84 KB
 * file. Bundle size is a direct input to cold-start time, and this function sits
 * on the critical path of every shared link.
 *
 * Get it too narrow and the failure is worse and quieter: `loadShell()` returns
 * null in production only, and every human who opens a watch link receives the
 * no-JavaScript fallback document. That cannot be caught locally, because the
 * developer's `dist/` is on disk either way.
 *
 * So this test pins both directions. It reads the source for filesystem access
 * and requires every path to be covered by the include list, and it requires the
 * include list to name nothing the code does not open.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

const vercelJson = JSON.parse(read('../../vercel.json'))
const watch = read('../watch.js')
const og = read('../og.js')

/** Paths a source file passes to `join(process.cwd(), …)`. */
function cwdJoins(src) {
  const out = []
  for (const m of src.matchAll(/join\(process\.cwd\(\),([^)]*)\)/g)) {
    const parts = m[1]
      .split(',')
      .map((s) => s.trim().replace(/^['"`]|['"`]$/g, ''))
      .filter(Boolean)
    if (parts.length) out.push(parts.join('/'))
  }
  return out
}

test('api/watch only reads dist/index.html, and that is what it is shipped', () => {
  const reads = cwdJoins(watch)
  assert.ok(reads.length > 0, 'expected loadShell to resolve a path from process.cwd()')

  // Both candidates are the same file seen from two working directories.
  for (const p of reads) {
    assert.match(
      p,
      /(^|\/)dist\/index\.html$/,
      `api/watch reads ${p}, which includeFiles does not ship`
    )
  }

  const include = vercelJson.functions['api/watch.js'].includeFiles
  assert.equal(
    include,
    'dist/index.html',
    'the glob must name exactly the file the handler opens — dist/** shipped 942 KB for a 4.84 KB read'
  )
})

test('api/og reads nothing from disk, so it ships nothing', () => {
  assert.equal(cwdJoins(og).length, 0, 'og.js gained a filesystem read; includeFiles must follow')
  assert.doesNotMatch(og, /readFileSync|createReadStream/)
  assert.equal(
    vercelJson.functions['api/og.js'].includeFiles,
    undefined,
    'og.js must not be given files it does not open'
  )
})

test('the shell fallback still exists, because a narrow glob makes it load-bearing', () => {
  // If includeFiles is ever wrong, loadShell() returns null and this HTTP path
  // is the only thing standing between a visitor and a blank response. It must
  // not be removed as "dead code" — it is the failure mode this test guards.
  assert.match(watch, /x-og-shell/, 'the over-HTTP shell fetch is the safety net for a bad glob')
  assert.match(watch, /function fallbackHtml/)
})
