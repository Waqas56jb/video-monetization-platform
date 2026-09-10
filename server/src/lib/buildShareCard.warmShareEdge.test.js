import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const dir = dirname(fileURLToPath(import.meta.url))
const shareCardSrc = readFileSync(join(dir, 'buildShareCard.js'), 'utf8')
const adminSrc = readFileSync(join(dir, '..', 'modules', 'admin.routes.js'), 'utf8').replace(/\r\n/g, '\n')

/**
 * A first-ever share is a race between whoever's client is building a link
 * preview and a cold Vercel edge cache. `warmShareEdge` fires our own
 * crawler-shaped request for the doc and the card image the moment a video
 * actually becomes public, so a real crawler that follows shortly after
 * hits a warm cache instead — report2.txt §6's mitigation for "desktop
 * sharing still shows a raw URL."
 */
test('warmShareEdge is exported, fire-and-forget, and never throws out of the module', () => {
  assert.match(shareCardSrc, /export function warmShareEdge\(slug\)/)
  const body = shareCardSrc.slice(shareCardSrc.indexOf('export function warmShareEdge'))
  // Both fetches must be .catch()'d directly — nothing here may propagate an
  // unhandled rejection into whichever request handler called this.
  const fetchCalls = body.match(/fetch\([\s\S]*?\.catch\(/g) || []
  assert.equal(fetchCalls.length, 2, 'expected exactly two fetch(...).catch(...) chains: doc and image')
})

test('warmShareEdge builds its URLs from the shared helpers, not hand-rolled strings', () => {
  const body = shareCardSrc.slice(
    shareCardSrc.indexOf('export function warmShareEdge'),
    shareCardSrc.indexOf('export function warmShareEdge') + 1400
  )
  assert.match(body, /publicWatchUrl\(env\.publicWebUrl, slug\)/)
  assert.match(body, /publicOgCardUrl\(env\.publicWebUrl, slug\)/)
})

test('the module import list actually includes the two URL helpers used above', () => {
  assert.match(shareCardSrc, /import \{ publicWatchUrl, publicOgCardUrl \} from '\.\/publicWatchUrl\.js'/)
})

test('both places a video becomes public call warmShareEdge, not only buildShareCard', () => {
  assert.match(adminSrc, /import \{ buildShareCard, warmShareEdge \} from '\.\.\/lib\/buildShareCard\.js'/)
  const hits = adminSrc.match(/warmShareEdge\(updated\.slug\)/g) || []
  assert.equal(hits.length, 2, 'expected one call in /review/:id/approve and one in /videos/:id/publish')
})

test('warmShareEdge is never awaited at either call site — it must not delay the response', () => {
  for (const marker of ['warmShareEdge(updated.slug)']) {
    let idx = adminSrc.indexOf(marker)
    while (idx !== -1) {
      const before = adminSrc.slice(Math.max(0, idx - 20), idx)
      assert.doesNotMatch(before, /await\s+$/, `found an "await" immediately before ${marker}`)
      idx = adminSrc.indexOf(marker, idx + 1)
    }
  }
})
