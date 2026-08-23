#!/usr/bin/env node
/**
 * Read-only report: auth users ↔ profiles ↔ sides.
 *
 *   node server/scripts/audit-auth-sides.js
 */
import { query, closePool } from '../src/db/pool.js'
import { log } from '../src/lib/logger.js'

const { rows } = await query(`
  select
    lower(coalesce(au.email, p.email)) as email,
    au.id as auth_user_id,
    p.id as profile_id,
    p.role,
    coalesce(p.viewer_enabled, false) as viewer_enabled,
    (cp.user_id is not null) as has_creator_profile,
    (select count(*)::int from purchases pu where pu.user_id = p.id) as purchase_count,
    (select count(*)::int from videos v where v.creator_id = p.id) as video_count
  from auth.users au
  full outer join profiles p on p.id = au.id
  left join creator_profiles cp on cp.user_id = p.id
  order by email nulls last, au.created_at nulls last
`)

const header = [
  'email'.padEnd(36),
  'auth'.padEnd(8),
  'profile'.padEnd(8),
  'role'.padEnd(12),
  'viewer'.padEnd(7),
  'creator'.padEnd(8),
  'buys'.padStart(5),
  'vids'.padStart(5),
].join(' ')
console.log(header)
console.log('-'.repeat(header.length))

const anomalies = []
for (const r of rows) {
  const email = String(r.email || '—').slice(0, 36).padEnd(36)
  const auth = r.auth_user_id ? 'yes' : 'MISSING'
  const profile = r.profile_id ? 'yes' : 'MISSING'
  const role = String(r.role || '—').padEnd(12)
  const viewer = r.viewer_enabled ? 'yes' : 'no'
  const creator = r.has_creator_profile ? 'yes' : 'no'
  console.log(
    `${email} ${auth.padEnd(8)} ${profile.padEnd(8)} ${role} ${viewer.padEnd(7)} ${creator.padEnd(8)} ${String(r.purchase_count ?? 0).padStart(5)} ${String(r.video_count ?? 0).padStart(5)}`
  )
  if (!r.auth_user_id && r.profile_id) anomalies.push(`profile without auth user: ${r.email || r.profile_id}`)
  if (r.auth_user_id && !r.profile_id) anomalies.push(`auth user without profile: ${r.email || r.auth_user_id}`)
  if (r.has_creator_profile && !r.profile_id) anomalies.push(`creator_profiles without profile: ${r.auth_user_id}`)
}

const dupes = await query(`
  select lower(email) as email, count(*)::int as n
    from auth.users
   group by lower(email)
  having count(*) > 1
`)
if (dupes.rows.length) {
  console.log('\nDUPLICATE auth.users emails:')
  for (const d of dupes.rows) console.log(`  ${d.email} × ${d.n}`)
} else {
  console.log('\nNo duplicate auth.users emails.')
}

if (anomalies.length) {
  console.log('\nAnomalies:')
  for (const a of anomalies) console.log(`  · ${a}`)
} else {
  console.log('No profile/auth anomalies detected.')
}

log.ok(`audit-auth-sides scanned ${rows.length} rows`)
await closePool().catch(() => {})
