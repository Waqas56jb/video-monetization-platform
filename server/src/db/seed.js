import { query } from './pool.js'
import { log } from '../lib/logger.js'

/**
 * Baseline configuration only.
 *
 * There is deliberately NO sample content here — no fake creators, videos,
 * purchases or earnings. Every number the apps display comes from real
 * activity, so an empty platform correctly shows an empty platform rather
 * than invented figures.
 *
 * Create the first admin with:  npm run admin:create -- you@example.com
 */
export async function seed() {
  log.info('ensuring platform settings')
  await query(
    `insert into platform_settings (id) values (1)
       on conflict (id) do nothing`
  )

  const { rows } = await query('select * from platform_settings where id = 1')
  const s = rows[0]

  log.ok('platform settings ready')
  console.log('')
  console.log(`   creator / platform split   ${s.creator_split_percent} / ${100 - s.creator_split_percent}`)
  console.log(`   minimum video price        TZS ${Number(s.min_video_price_tzs).toLocaleString()}`)
  console.log(`   minimum withdrawal         TZS ${Number(s.min_withdrawal_tzs).toLocaleString()}`)
  console.log(`   default free preview       ${s.default_preview_seconds}s`)
  console.log(`   default premiere window    ${s.default_premiere_days} days`)
  console.log(`   pre-roll ads               ${s.preroll_enabled ? 'on' : 'off'}`)
  console.log('')
  log.info('no sample content is created — the platform starts empty and fills with real activity')
  console.log('')
  log.info('next: npm run admin:create -- <your-email>')
  console.log('')

  return { settings: s }
}
