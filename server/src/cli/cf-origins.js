#!/usr/bin/env node
/**
 * Which sites are allowed to embed each video — and repair the ones that are
 * wrong.
 *
 *   npm run cf:origins           show what every video allows
 *   npm run cf:origins -- --fix  set them all to where the apps actually live
 *
 * This exists because the setting is stored on the video, permanently, at the
 * moment it is created. A video uploaded while the API was pointed at a
 * developer's localhost is locked to localhost for good: on the live site it
 * renders as a blank white player, and no amount of fixing the configuration
 * afterwards helps. The only cure is to go back and change each one, which is
 * what --fix does.
 */
import { env, capabilities } from '../config/env.js'
import { log } from '../lib/logger.js'

const shouldFix = process.argv.includes('--fix')
const API = `https://api.cloudflare.com/client/v4/accounts/${env.cloudflare.accountId}/stream`
const headers = { Authorization: `Bearer ${env.cloudflare.apiToken}`, 'Content-Type': 'application/json' }

const hostOf = (url) => {
  try {
    return new URL(url).host
  } catch {
    return String(url).replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  }
}
const isLocal = (h) => /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(h)

const wanted = [
  ...new Set([env.publicWebUrl, env.adminWebUrl, ...env.corsOrigins].filter(Boolean).map(hostOf)),
]

console.log('\n\x1b[35m  MTONYO+ \x1b[0m video embed permissions\n')

if (!capabilities.cloudflareStream) {
  log.error('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN must be set')
  process.exit(1)
}

console.log(`  the apps live at: ${wanted.join(', ') || '(nothing configured)'}\n`)

if (!wanted.length || wanted.every(isLocal)) {
  log.warn('Only localhost is configured. Set PUBLIC_WEB_URL and ADMIN_WEB_URL to the')
  log.warn('deployed addresses before fixing, or every video will be locked to this machine.')
  if (shouldFix) process.exit(1)
}

try {
  const res = await fetch(`${API}?per_page=1000`, { headers })
  const json = await res.json()
  if (!json.success) throw new Error((json.errors || []).map((e) => e.message).join('; '))

  const videos = json.result || []
  const same = (a, b) => a.length === b.length && a.every((x) => b.includes(x))

  const broken = []
  for (const v of videos) {
    const current = v.allowedOrigins || []
    const name = (v.meta?.name || '(no name)').slice(0, 34)

    // Unrestricted is fine — it plays anywhere. Restricted to the wrong place
    // is the failure, and restricted to localhost is the worst kind.
    const playableOnTheRealSite =
      current.length === 0 || wanted.filter((w) => !isLocal(w)).every((w) => current.includes(w))

    const state = current.length === 0 ? 'anywhere' : current.join(', ')
    const flag = playableOnTheRealSite ? '   ' : ' ! '
    console.log(`  ${flag}${name.padEnd(36)} ${state}`)

    if (!playableOnTheRealSite || (current.length && !same(current, wanted))) broken.push(v)
  }

  const unplayable = videos.filter(
    (v) => (v.allowedOrigins || []).length > 0 && (v.allowedOrigins || []).every(isLocal)
  )

  console.log(`\n  ${videos.length} video(s); ${broken.length} would benefit from a fix`)
  if (unplayable.length) {
    log.warn(`${unplayable.length} of them are locked to localhost and CANNOT play on the live site`)
  }

  if (!broken.length) {
    log.ok('nothing to do')
  } else if (!shouldFix) {
    console.log('\n  Run with --fix to point them all at the real sites:\n')
    console.log('    npm run cf:origins -- --fix\n')
  } else {
    let fixed = 0
    for (const v of broken) {
      const r = await fetch(`${API}/${v.uid}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ allowedOrigins: wanted }),
      })
      const j = await r.json().catch(() => ({}))
      if (j.success) fixed++
      else log.warn(`could not fix ${v.uid}: ${(j.errors || []).map((e) => e.message).join('; ')}`)
    }
    log.ok(`updated ${fixed} video(s) — they now play on ${wanted.join(', ')}`)
  }
} catch (err) {
  log.error(err.message)
  process.exitCode = 1
}
