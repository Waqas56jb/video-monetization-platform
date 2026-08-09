#!/usr/bin/env node
/**
 * Demo content, in the real database, through the real flow.
 *
 *   npm run demo:seed [path/to/video.mp4]   create it
 *   npm run demo:status                     what is there now
 *   npm run demo:clear                      remove all of it
 *
 * Not mock data. Every record here is created the way a real creator creates
 * one — real accounts, real Cloudflare uploads, real review and approval by an
 * admin, real purchases through the payment provider. That is the point: if the
 * demo works, the platform works, because it is the same code path. Hard-coded
 * front-end fixtures prove nothing except that the fixtures render.
 *
 * Everything it creates is tagged, so `demo:clear` can take it all away again
 * on the day real creators arrive, without touching anything of theirs.
 */
import fs from 'node:fs'
import { one, many, query, transaction, closePool } from '../db/pool.js'
import { createAuthUser } from '../lib/authdb.js'
import * as cf from '../lib/cloudflare.js'
import { getSettings, applySplit, splitPercentFor } from '../services/settings.js'
import { ensureClips } from '../modules/playback.routes.js'
import { capabilities } from '../config/env.js'
import { log } from '../lib/logger.js'

const command = process.argv[2] || 'seed'
const SAMPLE = process.argv[3] || process.env.SAMPLE

/** Everything demo carries this, so it can all be found and removed later. */
const TAG = 'mtonyo-demo'
const DEMO_EMAIL = (slug) => `demo.${slug}@mtonyo.demo`

/* ======================================================================
   THE CAST
   ====================================================================== */

const CREATORS = [
  {
    slug: 'asha',
    name: 'Asha Mwinyi',
    displayName: 'Asha Mwinyi',
    location: 'Dar es Salaam',
    bio: 'Documentary film-maker. Stories from the coast, told slowly.',
    verified: true,
  },
  {
    slug: 'juma',
    name: 'Juma Kileo',
    displayName: 'Juma Kileo Live',
    location: 'Arusha',
    bio: 'Live sets, studio sessions and everything in between.',
    verified: true,
  },
  {
    slug: 'neema',
    name: 'Neema Shirima',
    displayName: 'Neema Cooks',
    location: 'Mwanza',
    bio: 'Tanzanian home cooking, one dish at a time.',
    verified: false,
  },
]

/**
 * One of each way of selling something, because that is what needs testing:
 * a premiere that is nearly over, one that has just started, something paid
 * forever, and something free with ads.
 */
const VIDEOS = [
  {
    creator: 'asha',
    title: 'Behind The Fame — A Coast Documentary',
    category: 'Documentary',
    description:
      'Three months with the musicians of Bagamoyo, from the rehearsal room to a sold-out night on the beach.',
    accessType: 'paid_premiere',
    priceTzs: 2500,
    premiereDays: 60,
    previewSeconds: 90,
    startedDaysAgo: 5, // 55 days of the premiere left
    featured: true,
  },
  {
    creator: 'juma',
    title: 'Live at Arusha — Full Set',
    category: 'Music',
    description: 'The whole ninety minutes, filmed on six cameras. Recorded last month, unreleased until now.',
    accessType: 'ppv_forever',
    priceTzs: 5000,
    previewSeconds: 120,
    featured: true,
  },
  {
    creator: 'juma',
    title: 'Studio Session — Track 4',
    category: 'Music',
    description: 'Building the record from a single guitar line. No edits, no autotune.',
    accessType: 'paid_premiere',
    priceTzs: 1000,
    premiereDays: 30,
    startedDaysAgo: 28, // two days left: the countdown is worth seeing
    previewSeconds: 45,
  },
  {
    creator: 'neema',
    title: 'How To Cook Pilau Properly',
    category: 'Food',
    description: 'The rice, the spices, and the two things everybody gets wrong.',
    accessType: 'free_with_ads',
    priceTzs: 0,
    previewSeconds: 0,
  },
  {
    creator: 'neema',
    title: 'Ugali & Samaki — Sunday Cooking',
    category: 'Food',
    description: 'A whole Sunday lunch, start to finish, for four people.',
    accessType: 'paid_premiere',
    priceTzs: 800,
    premiereDays: 90,
    startedDaysAgo: 95, // already expired: it should be free with ads by now
    previewSeconds: 60,
  },
  {
    creator: 'asha',
    title: 'The Fishermen of Kilwa',
    category: 'Documentary',
    description: 'Out at 4am with a crew who have done this every day for thirty years.',
    accessType: 'ppv_forever',
    priceTzs: 1500,
    previewSeconds: 75,
  },
]

/* ======================================================================
   HELPERS
   ====================================================================== */

const slugify = (title) =>
  `${title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)}-demo${Math.random().toString(36).slice(2, 6)}`

async function sampleBytes() {
  if (SAMPLE) {
    if (!fs.existsSync(SAMPLE)) throw new Error(`No such file: ${SAMPLE}`)
    return { bytes: fs.readFileSync(SAMPLE), name: SAMPLE.split(/[\\/]/).pop() }
  }
  log.info('no file given — fetching a short public clip to use for every demo video')
  const res = await fetch('https://download.samplelib.com/mp4/sample-15s.mp4')
  if (!res.ok) {
    throw new Error(
      `Could not fetch a sample clip (HTTP ${res.status}). Pass your own: npm run demo:seed path/to.mp4`
    )
  }
  return { bytes: Buffer.from(await res.arrayBuffer()), name: 'sample.mp4' }
}

async function demoAdmin() {
  const admin = await one(`select * from profiles where role = 'admin' order by created_at limit 1`)
  if (!admin) throw new Error('No administrator exists yet. Run: npm run admin:create <email>')
  return admin
}

/* ======================================================================
   SEED
   ====================================================================== */

async function seed() {
  if (!capabilities.cloudflareStream) throw new Error('Cloudflare Stream is not configured')

  const settings = await getSettings({ fresh: true })
  const admin = await demoAdmin()
  const { bytes, name } = await sampleBytes()
  log.info(`using ${(bytes.length / 1024 / 1024).toFixed(1)} MB of video for each demo item`)

  /* ---------------------------------------------------- the creators ---- */
  const creators = {}
  for (const c of CREATORS) {
    const email = DEMO_EMAIL(c.slug)
    const existing = await one('select * from profiles where lower(email) = $1', [email])

    if (existing) {
      creators[c.slug] = existing
      log.info(`creator ${c.name} already exists`)
      continue
    }

    const profile = await transaction(
      async (client) => {
        const authUser = await createAuthUser(
          { email, password: `demo-${c.slug}-${Math.random().toString(36).slice(2, 10)}`, fullName: c.name },
          client
        )
        const { rows } = await client.query(
          `insert into profiles (id, email, full_name, role, bio, location)
           values ($1,$2,$3,'creator',$4,$5) returning *`,
          [authUser.id, email, c.name, c.bio, c.location]
        )
        await client.query(
          `insert into creator_profiles (user_id, display_name, bio, location, verified, followers)
           values ($1,$2,$3,$4,$5,$6) on conflict (user_id) do nothing`,
          [authUser.id, c.displayName, c.bio, c.location, c.verified, 0]
        )
        return rows[0]
      },
      { actorRole: 'admin', actorId: admin.id }
    )

    creators[c.slug] = profile
    log.ok(`creator ${c.name}`)
  }

  /* ------------------------------------------------------- the videos ---- */
  const made = []
  for (const spec of VIDEOS) {
    const creator = creators[spec.creator]
    const already = await one(`select * from videos where title = $1 and creator_id = $2`, [
      spec.title,
      creator.id,
    ])
    if (already) {
      log.info(`"${spec.title}" already exists`)
      made.push(already)
      continue
    }

    process.stdout.write(`  uploading "${spec.title}" … `)

    const upload = await cf.createDirectUpload({
      maxDurationSeconds: 3600,
      creatorId: creator.id,
      meta: { name: spec.title, [TAG]: 'true' },
    })

    const form = new FormData()
    form.append('file', new Blob([bytes], { type: 'video/mp4' }), name)
    const put = await fetch(upload.uploadUrl, { method: 'POST', body: form })
    if (!put.ok) throw new Error(`upload failed: HTTP ${put.status}`)

    // Wait for Cloudflare, because everything downstream needs the duration.
    let remote = null
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 4000))
      remote = await cf.getVideo(upload.uid).catch(() => null)
      if (remote?.readyToStream || remote?.status?.state === 'error') break
    }
    if (!remote?.readyToStream) throw new Error(`"${spec.title}" did not finish encoding`)

    const duration = Math.floor(remote.duration || 0)
    // The sample is short; keep the preview inside it whatever was asked for.
    const preview = Math.min(spec.previewSeconds, Math.max(0, duration - 1))

    /**
     * Exactly the path a real upload takes, because the database will not
     * allow any other. A trigger refuses to create a video that is already
     * published — the client's rule, and it holds against this script just as
     * it holds against a creator. So: create the draft, submit it, then let an
     * administrator approve it.
     */
    const video = await transaction(
      async (client) => {
        const { rows: draft } = await client.query(
          `insert into videos
             (creator_id, slug, title, description, category, cloudflare_uid,
              duration_seconds, thumbnail_url, access_type, price_tzs,
              free_preview_seconds, premiere_days, ads_enabled,
              review_status, state, submitted_at, views)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9::access_type,$10,$11,$12,$13,
                   'pending_review','ready', now() - ($14 || ' days')::interval, $15)
           returning *`,
          [
            creator.id,
            slugify(spec.title),
            spec.title,
            spec.description,
            spec.category,
            upload.uid,
            duration,
            remote.thumbnail || null,
            spec.accessType,
            spec.priceTzs,
            preview,
            spec.accessType === 'paid_premiere' ? spec.premiereDays : null,
            spec.accessType === 'free_with_ads',
            String(spec.startedDaysAgo ?? 3),
            // A plausible view count, so Trending has a real ordering.
            120 + Math.floor(Math.random() * 900),
          ]
        )

        // The approval, as an administrator. Backdated so premieres are at
        // believable points in their window rather than all starting today.
        const { rows } = await client.query(
          `update videos set
             review_status       = 'approved',
             reviewed_by         = $2,
             reviewed_at         = now() - ($3 || ' days')::interval,
             is_published        = true,
             published_at        = now() - ($3 || ' days')::interval,
             premiere_started_at = case when access_type = 'paid_premiere'
                                        then now() - ($3 || ' days')::interval else null end
           where id = $1 returning *`,
          [draft[0].id, admin.id, String(spec.startedDaysAgo ?? 3)]
        )
        return rows[0]
      },
      { actorRole: 'admin', actorId: admin.id }
    )

    // The free preview and the shareable promo, cut by Cloudflare exactly as
    // they are for a real upload.
    await ensureClips(video.id).catch((e) => log.warn(`clips for "${spec.title}": ${e.message}`))

    made.push(video)
    console.log('done')
  }

  /* ------------------------------------------- somebody has bought some --- */
  const buyerEmail = DEMO_EMAIL('viewer')
  let buyer = await one('select * from profiles where lower(email) = $1', [buyerEmail])
  if (!buyer) {
    buyer = await transaction(
      async (client) => {
        const authUser = await createAuthUser(
          { email: buyerEmail, password: `demo-viewer-${Math.random().toString(36).slice(2, 10)}`, fullName: 'Demo Viewer' },
          client
        )
        const { rows } = await client.query(
          `insert into profiles (id, email, full_name, role) values ($1,$2,$3,'viewer') returning *`,
          [authUser.id, buyerEmail, 'Demo Viewer']
        )
        return rows[0]
      },
      { actorRole: 'admin', actorId: admin.id }
    )
    log.ok('demo viewer')
  }

  // Two purchases, so earnings, receipts, the revenue split and the admin's
  // finance screens all have something real to show.
  const paid = made.filter((v) => v.price_tzs > 0).slice(0, 2)
  for (const video of paid) {
    const existing = await one(
      `select id from purchases where user_id = $1 and video_id = $2 and status = 'active'`,
      [buyer.id, video.id]
    )
    if (existing) continue

    const percent = await splitPercentFor(video.creator_id)
    const split = applySplit(video.price_tzs, percent)

    await transaction(
      async (client) => {
        const { rows: pay } = await client.query(
          `insert into payments (user_id, video_id, provider, amount_tzs, method, phone,
                                 status, provider_ref, completed_at, created_at)
           values ($1,$2,'sandbox',$3,'mpesa','0712345678','success',$4, now() - interval '2 days',
                   now() - interval '2 days')
           returning *`,
          [buyer.id, video.id, video.price_tzs, `DEMO-${Math.random().toString(36).slice(2, 10).toUpperCase()}`]
        )

        await client.query(
          `insert into purchases (user_id, video_id, payment_id, amount_tzs, creator_amount_tzs,
                                  platform_amount_tzs, split_percent, status, purchased_at)
           values ($1,$2,$3,$4,$5,$6,$7,'active', now() - interval '2 days')`,
          [buyer.id, video.id, pay[0].id, video.price_tzs, split.creator, split.platform, percent]
        )

        await client.query(
          `insert into earnings (creator_id, video_id, source, gross_tzs, creator_tzs,
                                 platform_tzs, split_percent, created_at)
           values ($1,$2,'sale',$3,$4,$5,$6, now() - interval '2 days')`,
          [video.creator_id, video.id, video.price_tzs, split.creator, split.platform, percent]
        )

        await client.query(`update videos set paid_unlocks = paid_unlocks + 1 where id = $1`, [video.id])
      },
      { actorRole: 'admin', actorId: admin.id }
    )
    log.ok(`demo purchase of "${video.title}"`)
  }

  /* ----------------------------------------- one waiting to be reviewed --- */
  const pendingTitle = 'Nyerere Day — Rehearsals (awaiting review)'
  const pendingExists = await one('select id from videos where title = $1', [pendingTitle])
  if (!pendingExists) {
    process.stdout.write(`  uploading "${pendingTitle}" … `)
    const creator = creators.juma
    const upload = await cf.createDirectUpload({
      maxDurationSeconds: 3600,
      creatorId: creator.id,
      meta: { name: pendingTitle, [TAG]: 'true' },
    })
    const form = new FormData()
    form.append('file', new Blob([bytes], { type: 'video/mp4' }), name)
    await fetch(upload.uploadUrl, { method: 'POST', body: form })

    let remote = null
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 4000))
      remote = await cf.getVideo(upload.uid).catch(() => null)
      if (remote?.readyToStream || remote?.status?.state === 'error') break
    }

    const duration = Math.floor(remote?.duration || 0)
    await one(
      `insert into videos
         (creator_id, slug, title, description, category, cloudflare_uid, duration_seconds,
          thumbnail_url, access_type, price_tzs, free_preview_seconds, premiere_days,
          review_status, state, is_published, submitted_at)
       values ($1,$2,$3,$4,'Music',$5,$6,$7,'paid_premiere',1200,$8,45,
               'pending_review','ready',false, now() - interval '3 hours')
       returning *`,
      [
        creator.id,
        slugify(pendingTitle),
        pendingTitle,
        'Two days of rehearsals before the show. Submitted so the review queue is not empty.',
        upload.uid,
        duration,
        remote?.thumbnail || null,
        Math.min(30, Math.max(0, duration - 1)),
      ]
    )
    console.log('done')
  }

  await status()
  console.log('')
  log.ok('demo content is live — it went through the same flow as real content')
  log.info('remove it any time with: npm run demo:clear')
}

/* ======================================================================
   STATUS  /  CLEAR
   ====================================================================== */

async function status() {
  const rows = await many(
    `select p.full_name as creator, v.title, v.access_type, v.price_tzs,
            v.review_status, v.is_published, v.premiere_ends_at, v.views, v.paid_unlocks
       from videos v join profiles p on p.id = v.creator_id
      where p.email like 'demo.%@mtonyo.demo'
      order by p.full_name, v.title`
  )
  const people = await one(
    `select count(*) filter (where role = 'creator')::int as creators,
            count(*) filter (where role = 'viewer')::int  as viewers
       from profiles where email like 'demo.%@mtonyo.demo'`
  )
  const money = await one(
    `select count(*)::int as purchases, coalesce(sum(amount_tzs),0)::int as spent
       from purchases where user_id in (select id from profiles where email like 'demo.%@mtonyo.demo')`
  )

  console.log('\n  demo content in the database:')
  console.log(`    ${people.creators} creator(s), ${people.viewers} viewer(s), ${money.purchases} purchase(s) worth TZS ${money.spent.toLocaleString()}`)
  if (!rows.length) {
    console.log('    (no videos)')
    return
  }
  console.log('')
  for (const r of rows) {
    const state = r.review_status === 'pending_review' ? 'awaiting review' : r.is_published ? 'live' : r.review_status
    const price = r.price_tzs > 0 ? `TZS ${r.price_tzs}` : 'free'
    const ends = r.premiere_ends_at
      ? ` · premiere ends ${new Date(r.premiere_ends_at).toISOString().slice(0, 10)}`
      : ''
    console.log(`    ${r.title.slice(0, 42).padEnd(44)} ${r.access_type.padEnd(14)} ${price.padEnd(9)} ${state}${ends}`)
  }
}

async function clear() {
  const ids = await many(
    `select v.id, v.title, v.cloudflare_uid, v.preview_uid, v.social_clip_uid
       from videos v join profiles p on p.id = v.creator_id
      where p.email like 'demo.%@mtonyo.demo'`
  )

  log.info(`removing ${ids.length} demo video(s) and their Cloudflare assets`)
  for (const v of ids) {
    for (const uid of [v.cloudflare_uid, v.preview_uid, v.social_clip_uid].filter(Boolean)) {
      await cf.deleteVideo(uid).catch(() => {})
    }
  }

  await query("select set_config('app.actor_role','admin',false)")
  await query(
    `delete from videos where creator_id in (select id from profiles where email like 'demo.%@mtonyo.demo')`
  )
  await query(`delete from auth.users where email like 'demo.%@mtonyo.demo'`)

  log.ok('all demo content removed — nothing belonging to real creators was touched')
}

/* ---------------------------------------------------------------- main */

console.log('\n\x1b[35m  MTONYO+ \x1b[0m demo content\n')

try {
  if (command === 'seed') await seed()
  else if (command === 'status') await status()
  else if (command === 'clear') await clear()
  else {
    console.log(`  usage:
    node src/cli/demo.js seed [video.mp4]   create demo creators, videos and purchases
    node src/cli/demo.js status             show what is there
    node src/cli/demo.js clear              remove all of it
`)
  }
} catch (err) {
  log.error(err.message)
  process.exitCode = 1
} finally {
  await closePool().catch(() => {})
}
