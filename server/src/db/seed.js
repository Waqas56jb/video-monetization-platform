import { one, query, transaction } from './pool.js'
import { capabilities } from '../config/env.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { log } from '../lib/logger.js'

/**
 * Starter data.
 *
 * `profiles.id` is a foreign key to `auth.users`, so every seeded person must
 * exist in Supabase Auth first. That needs the service-role key; without it we
 * seed only the parts that stand alone (settings, ad campaigns) and say so.
 */

const PEOPLE = [
  { key: 'admin',   email: 'admin@mtonyo.tz',    password: 'Mtonyo!Admin2026',   name: 'MTONYO+ Admin',      role: 'admin',   phone: '0712000000' },
  { key: 'konde',   email: 'konde@mtonyo.tz',    password: 'Mtonyo!Creator1',    name: 'Konde Gang Official', role: 'creator', phone: '0712345890', location: 'Dar es Salaam', verified: true },
  { key: 'zuchu',   email: 'zuchu@mtonyo.tz',    password: 'Mtonyo!Creator2',    name: 'Zuchu Studio',        role: 'creator', phone: '0765000002', location: 'Dar es Salaam', verified: true },
  { key: 'marioo',  email: 'marioo@mtonyo.tz',   password: 'Mtonyo!Creator3',    name: 'Marioo Music',        role: 'creator', phone: '0688000445', location: 'Arusha',        verified: true, split: 75 },
  { key: 'street',  email: 'street@mtonyo.tz',   password: 'Mtonyo!Creator4',    name: 'Street Vibes TZ',     role: 'creator', phone: '0754000019', location: 'Mwanza',        verified: false },
  { key: 'amina',   email: 'amina@mtonyo.tz',    password: 'Mtonyo!Viewer1',     name: 'Amina Kimaro',        role: 'viewer',  phone: '0712345890' },
  { key: 'john',    email: 'john@mtonyo.tz',     password: 'Mtonyo!Viewer2',     name: 'John Mwakyusa',       role: 'viewer',  phone: '0765000221' },
]

const VIDEOS = [
  {
    creator: 'konde', title: 'Harmonize — Behind The Fame', category: 'Documentary',
    description: 'A deep look into the life, hustle and journey of Harmonize — exclusive backstage footage, studio sessions and the untold story behind the fame. Filmed across Dar es Salaam over six months.',
    access: 'paid_premiere', price: 500, preview: 300, premiereDays: 30, duration: 1214,
    review: 'approved', published: true, views: 25430,
  },
  {
    creator: 'zuchu', title: 'The Journey — Live From Dar', category: 'Concert',
    description: 'A full live concert recorded in Dar es Salaam — the complete set, unedited, in adaptive HD.',
    access: 'ppv_forever', price: 1000, preview: 240, duration: 2702,
    review: 'approved', published: true, views: 35120,
  },
  {
    creator: 'marioo', title: 'Studio Session Live Vol. 3', category: 'Music',
    description: 'Behind the glass for a full studio session — writing, tracking and the takes that made the final record.',
    access: 'ppv_forever', price: 800, preview: 300, duration: 1967,
    review: 'approved', published: true, views: 21490,
  },
  {
    creator: 'street', title: 'Konser Dar Live — Full Show', category: 'Concert',
    description: 'The full Konser Dar live show. This premiere has ended, so the video is now free with a short ad before playback.',
    access: 'free_with_ads', price: 0, preview: 0, duration: 1102,
    review: 'approved', published: true, views: 18230, ads: true,
  },
  {
    creator: 'zuchu', title: 'Acoustic Session Vol. 2', category: 'Music',
    description: 'An intimate acoustic set recorded in one take.',
    access: 'paid_premiere', price: 600, preview: 180, premiereDays: 60, duration: 1565,
    review: 'pending_review', published: false, views: 0,
  },
  {
    creator: 'street', title: 'Street Session — Raw Cut', category: 'Music',
    description: 'Raw street session footage from Mwanza.',
    access: 'ppv_forever', price: 300, preview: 120, duration: 760,
    review: 'rejected', published: false, views: 0,
    rejection: 'Audio contains a copyrighted track between 02:10 and 04:35. Replace or license the track and resubmit.',
  },
  {
    creator: 'marioo', title: 'Bongo Comedy Night — Live', category: 'Comedy',
    description: 'A full stand-up night recorded live in Arusha.',
    access: 'paid_premiere', price: 1200, preview: 300, premiereDays: 90, duration: 3131,
    review: 'pending_review', published: false, views: 0,
  },
]

const CAMPAIGNS = [
  { name: 'Vodacom Tanzania', advertiser: 'Vodacom', cpm: 5200 },
  { name: 'Azam TV',          advertiser: 'Azam',    cpm: 4400 },
  { name: 'NMB Bank',         advertiser: 'NMB',     cpm: 3900, active: false },
]

const slug = (t) =>
  t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)

/** Create or find the auth user, returning their id. */
async function ensureAuthUser(person) {
  const sb = supabaseAdmin()

  const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const existing = list?.users?.find((u) => u.email?.toLowerCase() === person.email.toLowerCase())
  if (existing) return existing.id

  const { data, error } = await sb.auth.admin.createUser({
    email: person.email,
    password: person.password,
    email_confirm: true,
    user_metadata: { full_name: person.name },
  })
  if (error) throw new Error(`${person.email}: ${error.message}`)
  return data.user.id
}

export async function seed() {
  log.info('seeding platform settings')
  await query(
    `insert into platform_settings (id) values (1)
       on conflict (id) do update set updated_at = now()`
  )

  log.info('seeding ad campaigns')
  for (const c of CAMPAIGNS) {
    const exists = await one('select id from ad_campaigns where name = $1', [c.name])
    if (!exists) {
      await query(
        `insert into ad_campaigns (name, advertiser, cpm_tzs, active) values ($1,$2,$3,$4)`,
        [c.name, c.advertiser, c.cpm, c.active !== false]
      )
    }
  }

  if (!capabilities.supabaseAuth) {
    log.warn('SUPABASE_SERVICE_ROLE_KEY is not set — skipping people and videos.')
    log.warn('profiles.id is a foreign key to auth.users, so accounts must be created in Supabase Auth first.')
    log.ok('seeded settings + ad campaigns')
    return { partial: true }
  }

  log.info('creating auth users')
  const ids = {}
  for (const p of PEOPLE) {
    ids[p.key] = await ensureAuthUser(p)
    log.debug(`  ${p.email} → ${ids[p.key]}`)
  }

  log.info('seeding profiles')
  for (const p of PEOPLE) {
    await query(
      `insert into profiles (id, email, full_name, phone, role)
       values ($1,$2,$3,$4,$5)
       on conflict (id) do update set full_name = excluded.full_name, role = excluded.role`,
      [ids[p.key], p.email, p.name, p.phone, p.role]
    )
    if (p.role === 'creator') {
      await query(
        `insert into creator_profiles (user_id, display_name, location, verified, revenue_split_percent, payout_phone, payout_method)
         values ($1,$2,$3,$4,$5,$6,'mpesa')
         on conflict (user_id) do update set
           display_name = excluded.display_name, verified = excluded.verified,
           revenue_split_percent = excluded.revenue_split_percent`,
        [ids[p.key], p.name, p.location || null, p.verified ?? false, p.split ?? null, p.phone]
      )
    }
  }

  log.info('seeding videos')
  const videoIds = {}
  for (const v of VIDEOS) {
    const existing = await one('select id from videos where title = $1', [v.title])
    if (existing) {
      videoIds[v.title] = existing.id
      continue
    }

    // Publication is an admin action, so the guard needs the admin flag.
    const created = await transaction(
      async (client) => {
        const { rows } = await client.query(
          `insert into videos
             (creator_id, slug, title, description, category, duration_seconds, state,
              access_type, price_tzs, free_preview_seconds, premiere_days,
              review_status, rejection_reason, submitted_at, reviewed_at, reviewed_by,
              is_published, published_at, ads_enabled, views,
              premiere_started_at)
           values ($1,$2,$3,$4,$5,$6,'ready',$7,$8,$9,$10,$11,$12,
                   case when $11 = 'draft' then null else now() end,
                   case when $11 in ('approved','rejected') then now() else null end,
                   case when $11 in ('approved','rejected') then $13 else null end,
                   $14, case when $14 then now() else null end, $15, $16,
                   case when $7 = 'paid_premiere' and $14 then now() else null end)
           returning *`,
          [
            ids[v.creator], slug(v.title), v.title, v.description, v.category, v.duration,
            v.access, v.price, v.preview, v.premiereDays ?? null,
            v.review, v.rejection ?? null, ids.admin,
            v.published, v.ads ?? false, v.views,
          ]
        )
        return rows[0]
      },
      { actorRole: 'admin', actorId: ids.admin }
    )
    videoIds[v.title] = created.id
  }

  log.info('seeding purchases and earnings')
  const sales = [
    { buyer: 'amina', title: 'Harmonize — Behind The Fame', method: 'airtel' },
    { buyer: 'amina', title: 'The Journey — Live From Dar', method: 'mpesa' },
    { buyer: 'john',  title: 'Studio Session Live Vol. 3',  method: 'mpesa' },
  ]

  for (const s of sales) {
    const videoId = videoIds[s.title]
    if (!videoId) continue
    const already = await one(
      `select id from purchases where user_id = $1 and video_id = $2 and status = 'active'`,
      [ids[s.buyer], videoId]
    )
    if (already) continue

    const video = await one('select * from videos where id = $1', [videoId])
    const creatorPct = await one(
      `select coalesce(cp.revenue_split_percent, ps.creator_split_percent) as pct
         from platform_settings ps
         left join creator_profiles cp on cp.user_id = $1 where ps.id = 1`,
      [video.creator_id]
    )
    const pct = creatorPct.pct
    const creatorAmt = Math.round((video.price_tzs * pct) / 100)
    const platformAmt = video.price_tzs - creatorAmt

    await transaction(async (client) => {
      const { rows: pay } = await client.query(
        `insert into payments (user_id, video_id, provider, provider_ref, amount_tzs, method, phone, status, completed_at)
         values ($1,$2,'sandbox',$3,$4,$5,$6,'success',now()) returning *`,
        [ids[s.buyer], videoId, `SEED-${Math.random().toString(36).slice(2, 9).toUpperCase()}`,
         video.price_tzs, s.method, '0712345890']
      )
      const { rows: pur } = await client.query(
        `insert into purchases (user_id, video_id, payment_id, amount_tzs, split_percent, creator_amount_tzs, platform_amount_tzs)
         values ($1,$2,$3,$4,$5,$6,$7) returning *`,
        [ids[s.buyer], videoId, pay[0].id, video.price_tzs, pct, creatorAmt, platformAmt]
      )
      await client.query(
        `insert into earnings (creator_id, video_id, purchase_id, source, gross_tzs, creator_tzs, platform_tzs, split_percent)
         values ($1,$2,$3,'sale',$4,$5,$6,$7)`,
        [video.creator_id, videoId, pur[0].id, video.price_tzs, creatorAmt, platformAmt, pct]
      )
      await client.query('update videos set paid_unlocks = paid_unlocks + 1 where id = $1', [videoId])
    })
  }

  log.ok('seed complete')
  console.log('\n  test accounts (password shown):')
  for (const p of PEOPLE) {
    console.log(`   ${p.role.padEnd(8)} ${p.email.padEnd(22)} ${p.password}`)
  }
  console.log('')

  return { partial: false, people: PEOPLE.length, videos: VIDEOS.length }
}

export { PEOPLE, VIDEOS }
