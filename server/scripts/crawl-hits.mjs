/**
 * Read back crawler_hits — every request the two link-preview functions saw,
 * request by request, with the whole shape each one arrived in.
 *
 * This is the read side of migration 039. After reproducing a share on a
 * real device, run it for the window in question and read off, per request:
 * who asked (User-Agent, client IP, country/city), how (method, Sec-Fetch-*,
 * Accept, Origin, Referer), what we answered (doc) and by which rule
 * (decision), how fast, and from which deploy.
 *
 *   node scripts/crawl-hits.mjs                 # last 6 hours
 *   HOURS=1 node scripts/crawl-hits.mjs
 *   SLUG=some-slug node scripts/crawl-hits.mjs  # one video only
 *   SINCE=2026-09-14T07:00:00Z node scripts/crawl-hits.mjs
 *   RAW=1 node scripts/crawl-hits.mjs           # full headers JSON per row
 *
 * Read-only. Uses the API's own DATABASE_URL from server/.env.
 */
import 'dotenv/config'

const { query, getPool } = await import('../src/db/pool.js')

const HOURS = Number(process.env.HOURS || 6)
const SLUG = process.env.SLUG || null
const SINCE = process.env.SINCE ? new Date(process.env.SINCE) : new Date(Date.now() - HOURS * 3600e3)
const RAW = process.env.RAW === '1'

const params = [SINCE.toISOString()]
let where = 'at >= $1'
if (SLUG) {
  params.push(SLUG)
  where += ` and slug = $${params.length}`
}

const { rows } = await query(
  `select at, asset, method, crawler, doc, decision, status, ms, cache, region, build,
          slug, query, ip, country, city, user_agent, headers
     from crawler_hits
    where ${where}
    order by at asc`,
  params
)

const pad = (v, n) => String(v ?? '-').padEnd(n)
const stamp = (d) => new Date(d).toISOString().replace('T', ' ').replace('Z', '')

console.log(
  `crawler_hits since ${SINCE.toISOString()}${SLUG ? ` for slug=${SLUG}` : ''} — ${rows.length} row(s)\n`
)

for (const r of rows) {
  console.log(
    `${stamp(r.at)}  ${pad(r.asset, 5)} ${pad(r.method, 7)} ${pad(r.crawler, 22)} doc=${pad(r.doc, 9)} ` +
      `${pad(r.status, 4)} ${String(r.ms ?? '-').padStart(5)}ms  build=${r.build ?? '-'}  region=${r.region ?? '-'}`
  )
  console.log(`    from   ${r.ip ?? '-'}  ${r.country ?? '-'}${r.city ? ' / ' + r.city : ''}`)
  console.log(`    slug   ${r.slug ?? '-'}${r.query ? '  ?' + r.query : ''}`)
  console.log(`    ua     ${r.user_agent ?? '(none)'}`)
  if (r.decision) console.log(`    why    ${r.decision}`)
  if (r.cache) console.log(`    cache  ${r.cache}`)
  if (r.headers) {
    const h = r.headers
    if (RAW) console.log(`    hdrs   ${JSON.stringify(h)}`)
    else {
      const keys = ['sec-fetch-mode', 'sec-fetch-dest', 'sec-fetch-site', 'accept', 'origin', 'referer', 'sec-ch-ua-platform', 'upgrade-insecure-requests']
      const brief = keys.filter((k) => h[k] != null).map((k) => `${k}=${h[k]}`)
      const extra = Object.keys(h).filter((k) => !keys.includes(k))
      console.log(`    hdrs   ${brief.join('  ') || '(none captured)'}${extra.length ? `  +${extra.length} more (RAW=1)` : ''}`)
    }
  }
  console.log()
}

/* A summary at the end: what asked, and what it was given. */
const tally = new Map()
for (const r of rows) {
  const k = `${r.asset}  ${r.crawler ?? '-'}  doc=${r.doc ?? '-'}`
  tally.set(k, (tally.get(k) || 0) + 1)
}
if (tally.size) {
  console.log('### by asset / crawler / doc')
  for (const [k, n] of [...tally.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(4)}  ${k}`)
}

try {
  await getPool().end()
} catch {
  /* nothing to close */
}
