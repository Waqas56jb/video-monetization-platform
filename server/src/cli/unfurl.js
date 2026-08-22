#!/usr/bin/env node
/**
 * The WhatsApp link-preview experiment.
 *
 *   node src/cli/unfurl.js setup   -- mint four URLs and warm the ones we warm
 *   node src/cli/unfurl.js report  -- read what actually crawled us
 *
 * The question is narrow and worth stating exactly, because it is easy to
 * drift off it: sharing from a laptop sends a bare link unless the sender
 * waits two to four seconds after pasting. Our whole chain answers in under
 * 1.4 seconds, so the wait is not us. The open question is whether anything
 * we can do in advance -- warming a cache somewhere -- removes it.
 *
 * Four URLs, one variable:
 *
 *   A  cold      nothing touches it. The control.
 *   B  whatsapp  WhatsApp itself has already built a preview for it once.
 *   C  meta      Meta scraped it, but WhatsApp never saw it.
 *   D  cdn       our own edge is hot, but nobody outside has ever asked.
 *
 * C is the interesting one. If C behaves like B, Meta's scrape reaches
 * WhatsApp's preview cache, and we can warm every video at publish time. If C
 * behaves like A, that idea is dead and we stop spending on it.
 *
 * Every arm must be a URL WhatsApp has never seen, or its cache answers
 * instead of its crawler and the run means nothing. `?e=<token>` does that,
 * and the token reaches og:url and og:image too -- if the arms shared those,
 * warming one would warm all four.
 */

import { query } from '../db/pool.js'

const SITE = process.env.PUBLIC_SITE_URL || 'https://video-monetization-platform-chi.vercel.app'
const SLUG = process.env.UNFURL_SLUG || 'live-at-arusha-full-set'

/**
 * The real crawler signatures, as Meta documents them: A, I and N for Android,
 * iOS and Web. The suffix is the only thing that tells the three apart, and
 * the HTML route sends `Vary: User-Agent`, so warming has to use the same
 * strings a crawler would or it warms a cache entry nobody will ask for.
 */
const UAS = {
  android: 'WhatsApp/2.24.15.78 A',
  ios: 'WhatsApp/2.24.15.78 I',
  web: 'WhatsApp/2.24.15.78 N',
}

const ARMS = [
  { id: 'A', arm: 'cold', warm: 'nothing -- this is the control' },
  { id: 'B', arm: 'whatsapp', warm: 'you: paste into WhatsApp once, let the card appear' },
  { id: 'C', arm: 'meta', warm: 'you: run it through the Facebook Sharing Debugger' },
  { id: 'D', arm: 'cdn', warm: 'this script: our own edge, HTML and image' },
]

const token = (id, stamp) => `${stamp}${id.toLowerCase()}`
const watchUrl = (t) => `${SITE}/watch/${SLUG}?e=${t}`
const cardUrl = (t) => `${SITE}/og/card/${SLUG}.jpg?e=${t}`

async function timed(url, ua) {
  const started = Date.now()
  try {
    const r = await fetch(url, { headers: { 'User-Agent': ua }, signal: AbortSignal.timeout(20000) })
    const body = await r.arrayBuffer()
    return { status: r.status, ms: Date.now() - started, bytes: body.byteLength }
  } catch (err) {
    return { status: 0, ms: Date.now() - started, bytes: 0, error: String(err.message || err) }
  }
}

async function setup() {
  // A stamp rather than a random string: the tokens sort, and a later report
  // can tell one run's arms from the next one's without being told.
  const stamp = new Date().toISOString().slice(2, 16).replace(/[-:T]/g, '')
  console.log(`\n  run ${stamp} · ${SLUG}\n`)

  for (const { id, arm, warm } of ARMS) {
    const t = token(id, stamp)
    console.log(`  ${id}  ${arm.padEnd(9)} ${watchUrl(t)}`)
    console.log(`     warmed by: ${warm}`)

    if (arm === 'cdn') {
      // The image first: it has no Vary, so one fetch warms the entry every
      // crawler will hit. Then the document, once per crawler signature,
      // because Vary: User-Agent gives each its own entry.
      const img = await timed(cardUrl(t), UAS.web)
      console.log(`     image  ${img.status} ${img.ms}ms ${img.bytes}B`)
      for (const [name, ua] of Object.entries(UAS)) {
        const html = await timed(watchUrl(t), ua)
        console.log(`     html/${name.padEnd(8)} ${html.status} ${html.ms}ms ${html.bytes}B`)
      }
    }
    console.log('')
  }

  console.log(`  Facebook Sharing Debugger, for arm C only:`)
  console.log(`  https://developers.facebook.com/tools/debug/?q=${encodeURIComponent(watchUrl(token('C', stamp)))}\n`)
  console.log(`  Then send each of the four from WhatsApp Web -- paste, send immediately,`)
  console.log(`  and write down whether the recipient got a card or a bare link.`)
  console.log(`  Afterwards: npm run unfurl:report\n`)
}

/**
 * Which half of the chain a row is.
 *
 * The API stores an `asset` column, but production is running a build from
 * before that column was filled in and labels everything 'html'; the account
 * is over its daily deployment limit, so it cannot be corrected today. The
 * poster proxy passes the filename through in the query string, so `.jpg`
 * separates the two reliably in the meantime. Once the API redeploys, the
 * stored column becomes authoritative and this can go.
 */
const ASSET = `case when coalesce(query, '') like '%.jpg%' then 'image' else 'html' end`

async function report() {
  const runs = await query(
    `select substring(query from 'e=([0-9]{10}[a-d])') as tok,
            ${ASSET} as asset, crawler, count(*)::int n,
            min(at) as first_at, max(at) as last_at, round(avg(ms))::int as avg_ms
       from crawler_hits
      where query ~ 'e=[0-9]{10}[a-d]'
      group by 1, 2, 3
      order by 1, 2, 3`
  )

  if (!runs.rows.length) {
    console.log('\n  No experiment crawls recorded yet.\n')
  } else {
    console.log('\n  arm  asset  crawler            hits  avg ms  first                 last')
    for (const r of runs.rows) {
      const arm = String(r.tok || '?').slice(-1).toUpperCase()
      console.log(
        `  ${arm}    ${r.asset.padEnd(6)} ${String(r.crawler).padEnd(18)} ` +
          `${String(r.n).padEnd(5)} ${String(r.avg_ms ?? '-').padEnd(7)} ` +
          `${r.first_at.toISOString()}  ${r.last_at.toISOString()}`
      )
    }
    console.log('')
  }

  // Everything else that crawled us, so a real WhatsApp fetch is not missed
  // just because it carried no token.
  const all = await query(
    `select ${ASSET} as asset, crawler, count(*)::int n, max(at) as last_at
       from crawler_hits group by 1, 2 order by 4 desc`
  )
  console.log('  all traffic so far')
  console.log('  asset  crawler            hits  last')
  for (const r of all.rows) {
    console.log(
      `  ${r.asset.padEnd(6)} ${String(r.crawler).padEnd(18)} ${String(r.n).padEnd(5)} ${r.last_at.toISOString()}`
    )
  }
  console.log('')
}

const cmd = process.argv[2]
const run = cmd === 'report' ? report : cmd === 'setup' ? setup : null
if (!run) {
  console.log('\n  usage: node src/cli/unfurl.js setup | report\n')
  process.exit(1)
}
run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
