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
import crypto from 'node:crypto'
import { one, many, query, transaction, closePool } from '../db/pool.js'
import { recordImpression } from '../services/ads.js'
import { createAuthUser, setAuthPassword } from '../lib/authdb.js'
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
/** Fixed so the cast can be signed into during testing. Printed at seed end. */
const DEMO_PASSWORD = 'DemoPass123!'

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
 * Where the footage comes from.
 *
 * Public-domain and open-licensed films from the Internet Archive, chosen for
 * being freely redistributable and — crucially — *long*.
 *
 * The first version of this seeder gave every video the same fifteen-second
 * clip, which broke the demo in a way that took a while to see: a 15-second
 * video with a 14-second preview plays almost to the end before it stops, so a
 * paid video is indistinguishable from a free one. The client reported the
 * monetisation as broken, and they were right to — nothing on screen could have
 * told them otherwise. Real running times are not a nicety here; they are what
 * makes the paywall visible at all.
 *
 * Cloudflare fetches these itself, so nothing large passes through this machine.
 * Whatever you substitute must answer HEAD and range requests, or Cloudflare
 * cannot size the file and refuses the copy.
 */
const ARCHIVE = 'https://archive.org/download'
const FOOTAGE = {
  elephants: `${ARCHIVE}/ElephantsDream/ed_1024_512kb.mp4`, //  653s · 10m53s · 45MB
  popeye: `${ARCHIVE}/popeye_i_dont_scare/popeye_i_dont_scare_512kb.mp4`, // 366s · 6m06s · 25MB
}

/**
 * One of each way of selling something, because that is what needs testing:
 * a premiere that is nearly over, one that has just started, something paid
 * forever, and something free with ads.
 *
 * Preview lengths are deliberately a small fraction of each running time. The
 * client's own example was 300 seconds, so the flagship videos use exactly that
 * — the video must visibly stop with most of itself still to come.
 */
const VIDEOS = [
  {
    creator: 'asha',
    title: 'Behind The Fame — A Coast Documentary',
    category: 'Documentaries',
    description:
      'Three months with the musicians of Bagamoyo, from the rehearsal room to a sold-out night on the beach.',
    accessType: 'paid_premiere',
    priceTzs: 2500,
    premiereDays: 60,
    /* The client's own example: 300 seconds free, then it must stop. */
    previewSeconds: 300,
    startedDaysAgo: 5, // 55 days of the premiere left
    featured: true,
    source: FOOTAGE.elephants, // 653s, so ~6 minutes stay locked behind the paywall
  },
  {
    creator: 'juma',
    title: 'Live at Arusha — Full Set',
    category: 'Music',
    description: 'The whole set, filmed on six cameras. Recorded last month, unreleased until now.',
    accessType: 'ppv_forever',
    priceTzs: 5000,
    previewSeconds: 300,
    featured: true,
    source: FOOTAGE.elephants, // 653s
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
    previewSeconds: 60,
    source: FOOTAGE.popeye, // 366s
  },
  {
    creator: 'neema',
    title: 'How To Cook Pilau Properly',
    category: 'Courses',
    description: 'The rice, the spices, and the two things everybody gets wrong.',
    accessType: 'free_with_ads',
    priceTzs: 0,
    previewSeconds: 0,
    /* Long enough to carry a mid-roll as well as a pre- and post-roll. */
    source: FOOTAGE.elephants, // 653s — long enough for pre-, mid- and post-roll
  },
  {
    creator: 'neema',
    title: 'Ugali & Samaki — Sunday Cooking',
    category: 'Courses',
    description: 'A whole Sunday lunch, start to finish, for four people.',
    accessType: 'paid_premiere',
    priceTzs: 800,
    premiereDays: 90,
    startedDaysAgo: 95, // already expired: it should be free with ads by now
    previewSeconds: 45,
    source: FOOTAGE.elephants, // long enough to carry a mid-roll once it turns free
  },
  {
    creator: 'asha',
    title: 'The Fishermen of Kilwa',
    category: 'Documentaries',
    description: 'Out at 4am with a crew who have done this every day for thirty years.',
    accessType: 'ppv_forever',
    priceTzs: 1500,
    previewSeconds: 120,
    source: FOOTAGE.elephants,
  },
]

/**
 * A campaign, so "Free With Ads" can be seen actually paying somebody.
 *
 * The CPM is set where a real premium campaign would sit. It matters: at a CPM
 * of 1,000 a single impression is worth one shilling, and the creator's share of
 * that rounds to nothing on screen. At 25,000 an impression is 25 TZS and the
 * split is legible, which is the difference between demonstrating the mechanism
 * and appearing not to have built it.
 */
const CAMPAIGN = {
  name: 'Vodacom Tanzania — Q3 Data Bundles',
  advertiser: 'Vodacom Tanzania',
  cpmTzs: 25000,
  placements: ['pre_roll', 'mid_roll', 'post_roll'],
  skipAfterSeconds: 5,
  source: FOOTAGE.popeye,
}

/* ======================================================================
   HELPERS
   ====================================================================== */

const slugify = (title) =>
  `${title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)}-demo${Math.random().toString(36).slice(2, 6)}`

/**
 * Bring a video into Cloudflare and wait until it can be played.
 *
 * Cloudflare fetches from the URL itself. Passing a local file still works — it
 * takes the direct-upload route instead — but the default is a real film pulled
 * from a public source, because everything downstream depends on the running
 * time being real.
 */
/** Push bytes we already hold to Cloudflare over a one-time upload URL. */
async function pushBytes({ bytes, title, creatorId, filename = 'video.mp4' }) {
  const upload = await cf.createDirectUpload({
    maxDurationSeconds: 3600,
    creatorId,
    meta: { name: title, [TAG]: 'true' },
  })
  const form = new FormData()
  form.append('file', new Blob([bytes], { type: 'video/mp4' }), filename)
  const put = await fetch(upload.uploadUrl, { method: 'POST', body: form })
  if (!put.ok) throw new Error(`upload failed: HTTP ${put.status}`)
  return upload.uid
}

/** Downloaded footage, kept per URL so the same film is fetched once. */
const downloaded = new Map()

async function ingest({ url, title, creatorId, label = title }) {
  let uid

  if (SAMPLE) {
    if (!fs.existsSync(SAMPLE)) throw new Error(`No such file: ${SAMPLE}`)
    uid = await pushBytes({ bytes: fs.readFileSync(SAMPLE), title, creatorId, filename: 'sample.mp4' })
  } else {
    /**
     * Prefer letting Cloudflare fetch it — it is closer to the source than we
     * are and nothing large crosses this connection.
     *
     * But Cloudflare has to size the file before it will start, so the origin
     * must answer HEAD and range requests. The Internet Archive redirects to a
     * mirror whose hostname rotates, and some of those mirrors refuse HEAD. When
     * that happens, fall back to pulling the bytes here and pushing them up. It
     * is slower and it is not clever, but it does not depend on a stranger's
     * server supporting a request it never promised to.
     */
    try {
      const copied = await cf.copyFromUrl({ url, name: title, meta: { [TAG]: 'true', creatorId } })
      uid = copied.uid
    } catch (err) {
      process.stdout.write('(via this machine) ')
      let bytes = downloaded.get(url)
      if (!bytes) {
        const res = await fetch(url, { redirect: 'follow' })
        if (!res.ok) {
          throw new Error(
            `could not fetch "${label}" (Cloudflare: ${err.message.slice(0, 60)}; direct: HTTP ${res.status})`
          )
        }
        bytes = Buffer.from(await res.arrayBuffer())
        downloaded.set(url, bytes)
        process.stdout.write(`${(bytes.length / 1048576).toFixed(0)}MB `)
      }
      uid = await pushBytes({ bytes, title, creatorId })
    }
  }

  // A quarter-hour film takes considerably longer to ingest than a clip.
  let remote = null
  for (let i = 0; i < 150; i++) {
    await new Promise((r) => setTimeout(r, 4000))
    remote = await cf.getVideo(uid).catch(() => null)
    if (remote?.readyToStream || remote?.status?.state === 'error') break
    if (i % 8 === 7) process.stdout.write('·')
  }
  if (!remote?.readyToStream) {
    throw new Error(`"${label}" did not finish encoding (${remote?.status?.state || 'unknown'})`)
  }

  return { uid, remote, duration: Math.floor(remote.duration || 0) }
}

/**
 * A live campaign with a real advert behind it, plus impressions to prove it.
 *
 * The impressions go in through the same service the player calls, so the money
 * they generate is split and rolled up by exactly the code that will handle real
 * traffic. Seeding the earnings row directly would demonstrate nothing.
 */
async function seedCampaign({ made, admin, buyer }) {
  const existing = await one('select * from ad_campaigns where name = $1', [CAMPAIGN.name])
  let campaign = existing

  if (!campaign) {
    process.stdout.write(`  fetching the advert for "${CAMPAIGN.advertiser}" … `)
    const ingested = await ingest({
      url: CAMPAIGN.source,
      title: `AD · ${CAMPAIGN.name} (source)`,
      creatorId: admin.id,
      label: 'the advert',
    })

    /**
     * Cut it down to advert length.
     *
     * A six-minute pre-roll is not an advert, it is a hostage situation. The
     * clip is what the campaign serves; the full ingest stays behind it as the
     * master, exactly as a creator's video and its preview clip relate.
     */
    const AD_SECONDS = 30
    let uid = ingested.uid
    let duration = ingested.duration
    const remote = ingested.remote

    if (duration > AD_SECONDS + 5) {
      const clip = await cf
        .createClip({
          uid: ingested.uid,
          startSeconds: 0,
          endSeconds: AD_SECONDS,
          requireSignedURLs: true,
          name: `AD · ${CAMPAIGN.name}`,
        })
        .catch((e) => {
          log.warn(`could not clip the advert (${e.message}) — using the full length`)
          return null
        })

      if (clip?.uid) {
        // Wait for the clip, then drop the master: nothing else refers to it.
        for (let i = 0; i < 60; i++) {
          await new Promise((r) => setTimeout(r, 3000))
          const ready = await cf.getVideo(clip.uid).catch(() => null)
          if (ready?.readyToStream) break
        }
        uid = clip.uid
        duration = AD_SECONDS
        await cf.deleteVideo(ingested.uid).catch(() => {})
      }
    }

    campaign = await one(
      `insert into ad_campaigns
         (name, advertiser, cpm_tzs, active, cloudflare_uid, duration_seconds, thumbnail_url,
          starts_at, ends_at, placements, skip_after_seconds, notes, created_by)
       values ($1,$2,$3,true,$4,$5,$6,
               now() - interval '10 days', now() + interval '80 days',
               $7::ad_placement[], $8, $9, $10)
       returning *`,
      [
        CAMPAIGN.name,
        CAMPAIGN.advertiser,
        CAMPAIGN.cpmTzs,
        uid,
        duration,
        remote?.thumbnail || null,
        CAMPAIGN.placements,
        CAMPAIGN.skipAfterSeconds,
        'Demo campaign. Remove with npm run demo:clear.',
        admin.id,
      ]
    )
    console.log('done')
    log.ok(`campaign "${campaign.name}" — ${duration}s advert, CPM ${CAMPAIGN.cpmTzs}`)
  } else {
    log.info(`campaign "${CAMPAIGN.name}" already exists`)
  }

  /* Impressions against every video that actually carries advertising. */
  const eligible = await many(
    `select id, creator_id, category, access_type, ads_enabled, is_published, duration_seconds
       from videos
      where deleted_at is null and is_published
        and access_type = 'free_with_ads' and ads_enabled`
  )
  if (!eligible.length) {
    log.warn('no free-with-ads video to run the campaign against yet')
    return campaign
  }

  const before = await one(
    'select count(*)::int as n from ad_impressions where campaign_id = $1',
    [campaign.id]
  )
  if (before.n >= 40) {
    log.info(`campaign already has ${before.n} impressions`)
    return campaign
  }

  for (const video of eligible) {
    for (const placement of ['pre_roll', 'mid_roll', 'post_roll']) {
      // A share of viewers skip, exactly as they would in the wild, so the
      // completion rate on the admin screen is not a suspicious 100%.
      for (let i = 0; i < 14; i++) {
        const completed = Math.random() < 0.78
        await recordImpression({
          video,
          campaignId: campaign.id,
          userId: i % 3 === 0 ? buyer?.id : null,
          placement,
          playId: crypto.randomUUID(),
          secondsWatched: completed ? campaign.duration_seconds : 2 + Math.floor(Math.random() * 4),
          completed,
        })
      }
    }
  }

  const after = await one(
    `select count(*)::int as n, coalesce(sum(creator_micro_tzs),0)::bigint as creator_micro
       from ad_impressions where campaign_id = $1`,
    [campaign.id]
  )
  log.ok(
    `${after.n} ad impressions — TZS ${Math.round(Number(after.creator_micro) / 1_000_000)} to creators`
  )
  return campaign
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
  log.info(
    SAMPLE
      ? `using ${SAMPLE} for every demo video`
      : 'Cloudflare will fetch each film from its public source — this takes a few minutes'
  )

  /* ---------------------------------------------------- the creators ---- */
  const creators = {}
  for (const c of CREATORS) {
    const email = DEMO_EMAIL(c.slug)
    const existing = await one('select * from profiles where lower(email) = $1', [email])

    if (existing) {
      creators[c.slug] = existing
      await setAuthPassword(existing.id, DEMO_PASSWORD).catch(() => {})
      log.info(`creator ${c.name} already exists (password reset to demo default)`)
      continue
    }

    const profile = await transaction(
      async (client) => {
        const authUser = await createAuthUser(
          { email, password: DEMO_PASSWORD, fullName: c.name },
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

    process.stdout.write(`  fetching "${spec.title}" … `)

    const { uid, remote, duration } = await ingest({
      url: spec.source || FOOTAGE.bunny,
      title: spec.title,
      creatorId: creator.id,
    })
    /**
     * Keep the preview inside the video, but never let it become the whole
     * video. If the asked-for preview will not leave a clear locked remainder,
     * cut it to a fifth of the running time — a paid video whose preview covers
     * 93% of it is what made the client report the paywall as broken.
     */
    const asked = spec.previewSeconds
    const preview =
      asked > 0 && duration > 0
        ? asked <= duration * 0.5
          ? asked
          : Math.max(5, Math.floor(duration / 5))
        : Math.min(asked, Math.max(0, duration - 1))

    if (asked > 0 && preview !== asked) {
      process.stdout.write(`(preview trimmed ${asked}s→${preview}s of ${duration}s) `)
    }

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
            uid,
            duration,
            remote.thumbnail || null,
            spec.accessType,
            spec.priceTzs,
            preview,
            spec.accessType === 'paid_premiere' ? spec.premiereDays : null,
            spec.accessType === 'free_with_ads',
            String(spec.startedDaysAgo ?? 3),
            /**
             * Zero, deliberately.
             *
             * The view count comes from the view rows inserted further down, via
             * the trigger that owns it. Seeding a number here as well was how the
             * admin came to show 3.2K views against a few hundred actual rows —
             * the counter and its source counted the same thing twice.
             */
            0,
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
          { email: buyerEmail, password: DEMO_PASSWORD, fullName: 'Demo Viewer' },
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
  } else {
    await setAuthPassword(buyer.id, DEMO_PASSWORD).catch(() => {})
    log.info('demo viewer already exists (password reset to demo default)')
  }

  // Two purchases so earnings, receipts and the split have something real to
  // show — plus the premiere that has already expired, so a signed-in buyer
  // and a new viewer can be shown the same film with different ads.
  const titlesThatExpire = new Set(
    VIDEOS.filter(
      (s) =>
        s.accessType === 'paid_premiere' &&
        Number(s.startedDaysAgo || 0) >= Number(s.premiereDays || 0)
    ).map((s) => s.title)
  )

  const buyVideo = async (video, { daysAgo = 2, amountTzs } = {}) => {
    const amount = Number(amountTzs ?? video.price_tzs ?? 0)
    if (!video || amount <= 0) return false

    const existing = await one(
      `select id from purchases where user_id = $1 and video_id = $2 and status = 'active'`,
      [buyer.id, video.id]
    )
    if (existing) return false

    const percent = await splitPercentFor(video.creator_id)
    const split = applySplit(amount, percent)
    const age = `${Math.max(1, Number(daysAgo) || 2)} days`

    await transaction(
      async (client) => {
        const { rows: pay } = await client.query(
          `insert into payments (user_id, video_id, provider, amount_tzs, method, phone,
                                 status, provider_ref, completed_at, created_at)
           values ($1,$2,'sandbox',$3,'mpesa','0712345678','success',$4,
                   now() - ($5)::interval, now() - ($5)::interval)
           returning *`,
          [buyer.id, video.id, amount, `DEMO-${Math.random().toString(36).slice(2, 10).toUpperCase()}`, age]
        )

        const { rows: purchase } = await client.query(
          `insert into purchases (user_id, video_id, payment_id, amount_tzs, creator_amount_tzs,
                                  platform_amount_tzs, split_percent, status, purchased_at)
           values ($1,$2,$3,$4,$5,$6,$7,'active', now() - ($8)::interval)
           returning id`,
          [buyer.id, video.id, pay[0].id, amount, split.creator, split.platform, percent, age]
        )

        await client.query(
          `insert into earnings (creator_id, video_id, purchase_id, source, gross_tzs, creator_tzs,
                                 platform_tzs, split_percent, created_at)
           values ($1,$2,$3,'sale',$4,$5,$6,$7, now() - ($8)::interval)`,
          [
            video.creator_id,
            video.id,
            purchase[0].id,
            amount,
            split.creator,
            split.platform,
            percent,
            age,
          ]
        )
      },
      { actorRole: 'admin', actorId: admin.id }
    )
    log.ok(`demo purchase of "${video.title}"`)
    return true
  }

  const paid = made.filter((v) => Number(v.price_tzs) > 0 && !titlesThatExpire.has(v.title)).slice(0, 2)
  for (const video of paid) await buyVideo(video, { daysAgo: 2 })

  for (const spec of VIDEOS) {
    if (!titlesThatExpire.has(spec.title)) continue
    const video = made.find((v) => v.title === spec.title)
    const daysAgo = Math.max(2, Number(spec.startedDaysAgo || 10) - 5)
    await buyVideo(video, { daysAgo, amountTzs: spec.priceTzs })
  }

  /* ------------------------------------------------- views that add up ---- */
  /**
   * Real view rows rather than an invented counter.
   *
   * The counter used to be written directly, which is how the admin came to
   * report 3.2K views against 67 actual rows — two screens quoting two numbers
   * for the same fact. Inserting the rows and letting the trigger from migration
   * 006 do the counting means the two can never disagree.
   */
  for (const video of made) {
    const already = await one(
      'select count(*)::int as n from video_views where video_id = $1',
      [video.id]
    )
    if (already.n > 20) continue

    const wanted = 120 + Math.floor(Math.random() * 380)
    const preview = Number(video.free_preview_seconds || 0)
    await query(
      `insert into video_views (video_id, seconds_watched, reached_paywall, created_at)
       select $1,
              (random() * $3)::int,
              /* Roughly a third of viewers on a paid video get as far as the
                 paywall — enough for the conversion figures to mean something. */
              ($2 > 0 and random() < 0.34),
              now() - (random() * interval '30 days')
         from generate_series(1, $4)`,
      [video.id, preview, Math.max(30, Number(video.duration_seconds || 60)), wanted - already.n]
    )
  }
  log.ok('view history')

  /* ------------------------------------------------- an advert that runs --- */
  await seedCampaign({ made, admin, buyer })

  /* ----------------------------------------- one waiting to be reviewed --- */
  const pendingTitle = 'Nyerere Day — Rehearsals (awaiting review)'
  const pendingExists = await one('select id from videos where title = $1', [pendingTitle])
  if (!pendingExists) {
    process.stdout.write(`  fetching "${pendingTitle}" … `)
    const creator = creators.juma
    const { uid, remote, duration } = await ingest({
      url: FOOTAGE.popeye,
      title: pendingTitle,
      creatorId: creator.id,
    })
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
        uid,
        duration,
        remote?.thumbnail || null,
        Math.min(30, Math.max(0, duration - 1)),
      ]
    )
    console.log('done')
  }

  // Flip any premiere whose window already ended, so free-with-ads is visible
  // without waiting for the nightly cron.
  try {
    const { runPremiereExpiry } = await import('../jobs/premiere.js')
    const result = await runPremiereExpiry()
    const n = result?.switched?.length || 0
    if (n) log.info(`premiere job: ${n} video(s) moved to free-with-ads`)
  } catch (err) {
    log.warn(`premiere job skipped: ${err.message}`)
  }

  await status()
  console.log('')
  console.log('  sign in with any of these (same password for all demo accounts):')
  console.log(`    password:  ${DEMO_PASSWORD}`)
  for (const c of CREATORS) console.log(`    creator:   ${DEMO_EMAIL(c.slug)}`)
  console.log(`    viewer:    ${DEMO_EMAIL('viewer')}`)
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

  const ads = await one(
    `select count(distinct c.id)::int as campaigns,
            count(i.id)::int as impressions,
            coalesce(sum(i.creator_micro_tzs),0)::bigint as creator_micro
       from ad_campaigns c
       left join ad_impressions i on i.campaign_id = c.id
      where c.name = $1`,
    [CAMPAIGN.name]
  )

  console.log('\n  demo content in the database:')
  console.log(`    ${people.creators} creator(s), ${people.viewers} viewer(s), ${money.purchases} purchase(s) worth TZS ${money.spent.toLocaleString()}`)
  console.log(
    `    ${ads.campaigns} ad campaign(s), ${ads.impressions} impression(s), ` +
      `TZS ${Math.round(Number(ads.creator_micro) / 1_000_000).toLocaleString()} of ad revenue to creators`
  )
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
  await query("select set_config('app.actor_role','admin',false)")

  const ids = await many(
    `select v.id, v.title, v.cloudflare_uid, v.preview_uid, v.social_clip_uid,
            (select count(*)::int from purchases pu
              join profiles bp on bp.id = pu.user_id
             where pu.video_id = v.id and pu.status = 'active'
               and bp.email not like 'demo.%@mtonyo.demo') as real_purchases
       from videos v join profiles p on p.id = v.creator_id
      where p.email like 'demo.%@mtonyo.demo'`
  )

  /**
   * A demo video somebody real has paid for stops being demo content.
   *
   * The rule is that a purchase never vanishes, and it does not come with an
   * exception for how the video got there. Unpublish it and leave it alone; the
   * database would refuse the delete anyway, and it is right to.
   */
  const bought = ids.filter((v) => v.real_purchases > 0)
  const removable = ids.filter((v) => v.real_purchases === 0)

  for (const v of bought) {
    await query('update videos set is_published = false where id = $1', [v.id])
    log.warn(`kept "${v.title}" — ${v.real_purchases} real purchase(s); unpublished instead`)
  }

  /* Demo purchases are demo content and go with it. Payments and earnings first,
     so nothing is left pointing at a row that no longer exists. */
  const demoBuyers = `select id from profiles where email like 'demo.%@mtonyo.demo'`
  const demoCreators = `select id from profiles where email like 'demo.%@mtonyo.demo'`

  /**
   * Earnings are removed two ways on purpose.
   *
   * Going through `purchase_id` alone is what this used to do, and it silently
   * missed any row that had never been linked to one — which, until the insert
   * above was fixed, was all of them. Those rows outlived every teardown and
   * kept counting towards a creator's withdrawable balance, since that balance
   * is `sum(creator_tzs)` off this table. The second delete is scoped to demo
   * creators, so a real creator's ledger is never touched by a demo teardown.
   */
  await query(`delete from earnings where purchase_id in (
                 select id from purchases where user_id in (${demoBuyers}))`)
  await query(`delete from earnings where creator_id in (${demoCreators})`)
  await query(`delete from purchases where user_id in (${demoBuyers})`)
  await query(`delete from payments  where user_id in (${demoBuyers})`)

  log.info(`removing ${removable.length} demo video(s) and their Cloudflare assets`)
  for (const v of removable) {
    for (const uid of [v.cloudflare_uid, v.preview_uid, v.social_clip_uid].filter(Boolean)) {
      await cf.deleteVideo(uid).catch(() => {})
    }
  }

  /* The demo campaign, its advert, and everything it earned. */
  const campaigns = await many('select id, cloudflare_uid from ad_campaigns where name = $1', [
    CAMPAIGN.name,
  ])
  for (const c of campaigns) {
    if (c.cloudflare_uid) await cf.deleteVideo(c.cloudflare_uid).catch(() => {})
  }

  if (campaigns.length) {
    const cids = campaigns.map((c) => c.id)
    // The rolled-up ad earnings go with the impressions they were derived from.
    await query('delete from earnings where campaign_id = any($1::uuid[])', [cids])
    await query('delete from ad_impressions where campaign_id = any($1::uuid[])', [cids])
    await query('delete from ad_campaigns where id = any($1::uuid[])', [cids])
    log.info(`removed ${campaigns.length} demo ad campaign(s)`)
  }

  if (removable.length) {
    await query('delete from videos where id = any($1::uuid[])', [removable.map((v) => v.id)])
  }

  // A demo creator whose video had to stay must stay too, or the video loses the
  // person who made it.
  if (bought.length) {
    log.info('demo accounts kept, because content of theirs has real purchases against it')
  } else {
    await query(`delete from auth.users where email like 'demo.%@mtonyo.demo'`)
  }

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
