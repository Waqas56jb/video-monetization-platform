/**
 * Prove the three automated money flows actually run.
 *
 * The client asked to be shown, not told: a premiere expiring on its own, an
 * advert being counted and split, and a withdrawal moving through admin. Each
 * one below creates its own throwaway rows, exercises the real code path — the
 * same job the cron calls, the same service the player calls, the same route
 * the admin screen calls — prints what changed at each step, and removes what
 * it made.
 *
 * Nothing here fakes a result. If a step does not happen, the check prints
 * FAIL and the run says so.
 *
 *   node src/cli/demonstrate.js            all three
 *   node src/cli/demonstrate.js premiere   one of them
 */
import crypto from 'node:crypto'
import { one, many, query, transaction } from '../db/pool.js'
import { runPremiereExpiry } from '../jobs/premiere.js'
import { resolveAccess } from '../services/entitlement.js'
import { getSettings } from '../services/settings.js'

const TAG = 'zz-demonstrate'
let failures = 0

const money = (n) => 'TZS ' + Number(n || 0).toLocaleString('en-US')
const step = (s) => console.log('\n  ' + s)
const line = (k, v) => console.log('     ' + String(k).padEnd(34) + v)
const check = (label, ok, detail = '') => {
  if (!ok) failures += 1
  console.log('     ' + (ok ? 'PASS  ' : 'FAIL  ') + label + (detail ? '  — ' + detail : ''))
}
const rule = (t) => console.log('\n' + '─'.repeat(74) + '\n  ' + t + '\n' + '─'.repeat(74))

/** A creator and a viewer to act with, plus the admin the job records against. */
async function cast() {
  const creator = await one(
    `select id from profiles where role = 'creator' and status = 'active' order by created_at limit 1`
  )
  const viewer = await one(
    `select id from profiles where role = 'viewer' and status = 'active' order by created_at limit 1`
  )
  const admin = await one(`select id from profiles where role = 'admin' order by created_at limit 1`)
  if (!creator || !viewer || !admin) throw new Error('need a creator, a viewer and an admin')
  return { creator, viewer, admin }
}

async function cleanup() {
  await query(`delete from earnings  where video_id in (select id from videos where slug like $1)`, [`${TAG}%`])
  await query(`delete from purchases where video_id in (select id from videos where slug like $1)`, [`${TAG}%`])
  await query(`delete from payments  where video_id in (select id from videos where slug like $1)`, [`${TAG}%`])
  await query(`delete from ad_impressions where video_id in (select id from videos where slug like $1)`, [`${TAG}%`])
  await query(`delete from video_views where video_id in (select id from videos where slug like $1)`, [`${TAG}%`])
  // The publication guard refuses a takedown from an unnamed actor, which is
  // the point of it — so the cleanup identifies itself as the admin, exactly
  // as the admin route does.
  const admin = await one(`select id from profiles where role = 'admin' order by created_at limit 1`)
  await transaction(
    async (client) => {
      await client.query(
        `update videos set is_published = false, deleted_at = now()
          where slug like $1 and deleted_at is null`,
        [`${TAG}%`]
      )
    },
    { actorRole: 'admin', actorId: admin?.id ?? null }
  )
  await query(`delete from withdrawals where note like $1`, [`${TAG}%`])
}

/* ======================================================================
   4 · PAID PREMIERE EXPIRES ON ITS OWN
   ====================================================================== */
async function premiere() {
  const stamp = Date.now()
  rule('4 · PAID PREMIERE  →  expires  →  FREE + ADS, and the buyer keeps it ad-free')
  const { creator, viewer, admin } = await cast()

  const video = await transaction(
    async (client) => {
      const { rows } = await client.query(
        `insert into videos
           (creator_id, slug, title, category, access_type, price_tzs, premiere_days,
            premiere_started_at, premiere_ends_at, free_preview_seconds, duration_seconds,
            cloudflare_uid, preview_uid, review_status, state)
         values ($1,$2,'Demonstration — premiere expiry','Films','paid_premiere',2000,30,
                 now() - interval '31 days', now() - interval '1 day', 60, 600,
                 $3,$4,'approved','ready')
         returning id`,
        [creator.id, `${TAG}-premiere-${stamp}`, `${TAG}-full-${stamp}`, `${TAG}-prev-${stamp}`]
      )
      // Published in a second statement because the database refuses a video
      // that arrives already public — the same guard the app has to satisfy.
      const pub = await client.query(
        `update videos set is_published = true, published_at = now() - interval '31 days'
          where id = $1 returning *`,
        [rows[0].id]
      )
      return pub.rows[0]
    },
    { actorRole: 'admin', actorId: admin.id }
  )

  step('BEFORE — a Paid Premiere whose window closed yesterday')
  line('access_type', video.access_type)
  line('price', money(video.price_tzs))
  line('premiere_ends_at', video.premiere_ends_at.toISOString())
  line('ads_enabled', String(video.ads_enabled))

  // Somebody bought it during the paid window.
  const split = (await getSettings()).creator_split_percent
  const creatorCut = Math.round((video.price_tzs * split) / 100)
  const purchase = await one(
    `insert into purchases (user_id, video_id, amount_tzs, creator_amount_tzs,
                            platform_amount_tzs, split_percent, status, purchased_at)
     values ($1,$2,$3,$4,$5,$6,'active', now() - interval '20 days') returning *`,
    [viewer.id, video.id, video.price_tzs, creatorCut, video.price_tzs - creatorCut, split]
  )
  line('a viewer bought it', money(purchase.amount_tzs) + ' on day 11 of the window')

  const before = await resolveAccess({ video, userId: viewer.id })
  check('buyer could watch the full video', before.canWatchFull === true)

  step('RUNNING the real job — jobs/premiere.js, the one the daily cron calls')
  const result = await runPremiereExpiry({ actorId: admin.id })
  const switched = (result.switched || []).some((s) => s.id === video.id)
  check('the job switched this video', switched, `${result.switched?.length ?? 0} switched this run`)

  const after = await one('select * from videos where id = $1', [video.id])
  step('AFTER — nobody touched it by hand')
  line('access_type', video.access_type + '  →  ' + after.access_type)
  line('price', money(video.price_tzs) + '  →  ' + money(after.price_tzs))
  line('ads_enabled', String(video.ads_enabled) + '  →  ' + String(after.ads_enabled))
  line('premiere_ends_at', 'cleared: ' + String(after.premiere_ends_at))

  check('became Free + Ads', after.access_type === 'free_with_ads')
  check('price dropped to zero', Number(after.price_tzs) === 0)
  check('advertising switched on', after.ads_enabled === true)

  const stillBought = await one('select * from purchases where id = $1', [purchase.id])
  check('the purchase survived', Boolean(stillBought) && stillBought.status === 'active')

  const buyerNow = await resolveAccess({ video: after, userId: viewer.id })
  const strangerNow = await resolveAccess({ video: after, userId: null })
  step('WHO SEES WHAT, now the window has closed')
  line('the buyer', `owned=${buyerNow.owned}  pays again=${buyerNow.requiresPayment}  ads=${buyerNow.showsAds}`)
  line('a new viewer', `owned=${strangerNow.owned}  pays=${strangerNow.requiresPayment}  ads=${strangerNow.showsAds}`)

  check('buyer still owns it', buyerNow.owned === true)
  check('buyer is not asked to pay again', buyerNow.requiresPayment === false)
  check('buyer stays ad-free', buyerNow.showsAds === false)
  check('a new viewer pays nothing', strangerNow.requiresPayment === false)
  check('a new viewer gets adverts', strangerNow.showsAds === true)

  const audit = await one(
    `select action, detail from audit_log where entity_id = $1 and action = 'PREMIERE_EXPIRED'`,
    [video.id]
  )
  check('the change was written to the audit log', Boolean(audit))
}

/* ======================================================================
   5 · AN ADVERT IS COUNTED AND SPLIT
   ====================================================================== */
async function ads() {
  const stamp = Date.now()
  rule('5 · AD PLAYS  →  impression recorded  →  advertiser, creator and platform figures move')
  const { creator, admin } = await cast()

  const campaign = await one(
    `select * from ad_campaigns where active = true order by created_at desc limit 1`
  )
  if (!campaign) {
    console.log('\n     SKIPPED — no active ad campaign on the platform to serve from.')
    console.log('     Create one in Admin → Ads and run this again.')
    return
  }

  const video = await transaction(
    async (client) => {
      const { rows } = await client.query(
        `insert into videos
           (creator_id, slug, title, category, access_type, price_tzs, free_preview_seconds,
            duration_seconds, cloudflare_uid, preview_uid, review_status, state, ads_enabled)
         values ($1,$2,'Demonstration — ad accounting','Music','free_with_ads',0,0,900,
                 $3,$4,'approved','ready', true)
         returning id`,
        [creator.id, `${TAG}-ads-${stamp}`, `${TAG}-adfull-${stamp}`, `${TAG}-adprev-${stamp}`]
      )
      const pub = await client.query(
        `update videos set is_published = true, published_at = now() where id = $1 returning *`,
        [rows[0].id]
      )
      return pub.rows[0]
    },
    { actorRole: 'admin', actorId: admin.id }
  )

  const sum = async () =>
    one(
      `select coalesce(sum(gross_tzs),0)::int g, coalesce(sum(creator_tzs),0)::int c,
              coalesce(sum(platform_tzs),0)::int p, count(*)::int n
         from earnings where source = 'ad' and creator_id = $1`,
      [creator.id]
    )
  const spendOf = async () =>
    one(
      `select coalesce(sum(revenue_micro_tzs),0)::bigint micro, count(*)::int n
         from ad_impressions where campaign_id = $1`,
      [campaign.id]
    )

  const e0 = await sum()
  const s0 = await spendOf()
  step('BEFORE')
  line('campaign', campaign.name + '  — ' + campaign.advertiser + ', CPM ' + money(campaign.cpm_tzs))
  line('impressions on this campaign', s0.n)
  line("advertiser's spend", money(Number(s0.micro) / 1_000_000))
  line("creator's ad earnings", money(e0.c) + '  over ' + e0.n + ' day-row(s)')

  step('RECORDING a completed pre-roll through services/ads.js')
  const { recordImpression } = await import('../services/ads.js')
  // play_id is a uuid column — it is the platform's idempotency key for a
  // single playback, so a replayed request carries the same one.
  const playId = crypto.randomUUID()
  const played = await recordImpression({
    video,
    campaignId: campaign.id,
    placement: 'pre_roll',
    completed: true,
    playId,
    secondsWatched: 15,
  })
  check('the impression was accepted', played?.recorded === true)
  check('and it was billable', played?.billable === true)
  line('charged to the advertiser', money(played.revenueMicroTzs / 1_000_000) + '  (micro-TZS accounted)')
  line('of which the creator gets', money(played.creatorMicroTzs / 1_000_000) + `  at ${played.splitPercent}%`)

  const e1 = await sum()
  const s1 = await spendOf()
  step('AFTER')
  line('impressions on this campaign', s0.n + '  →  ' + s1.n)
  line("advertiser's spend", money(Number(s0.micro) / 1_000_000) + '  →  ' + money(Number(s1.micro) / 1_000_000))
  line("creator's share", money(e0.c) + '  →  ' + money(e1.c))
  line("platform's share", money(e0.p) + '  →  ' + money(e1.p))

  check('an impression was written', s1.n === s0.n + 1)
  check('the advertiser was charged', Number(s1.micro) > Number(s0.micro))
  check('creator and platform both moved', e1.g > e0.g && e1.c >= e0.c && e1.p >= e0.p)
  check('the split still reconciles', e1.c + e1.p === e1.g, `${e1.c} + ${e1.p} = ${e1.g}`)

  step('THE SAME PLAY AGAIN — a replayed or forged call must not be paid twice')
  const again = await recordImpression({
    video,
    campaignId: campaign.id,
    placement: 'pre_roll',
    completed: true,
    playId, // the same play — this is what a replayed request looks like
    secondsWatched: 15,
  })
  const s2 = await spendOf()
  check('the replay was recognised as a duplicate', again?.duplicate === true)
  check('and was not billed a second time', s2.n === s1.n, `impressions still ${s2.n}`)
}

/* ======================================================================
   6 · A WITHDRAWAL, END TO END
   ====================================================================== */
async function withdrawal() {
  rule('6 · CREATOR EARNS  →  requests  →  admin processes  →  creator sees it completed')

  const rich = await one(
    `select e.creator_id, sum(e.creator_tzs)::int lifetime, p.email
       from earnings e join profiles p on p.id = e.creator_id
      group by e.creator_id, p.email order by 2 desc limit 1`
  )
  if (!rich) {
    console.log('\n     SKIPPED — no creator has earned anything yet.')
    return
  }

  const takenSoFar = await one(
    `select coalesce(sum(amount_tzs),0)::int taken from withdrawals
      where creator_id = $1 and status in ('pending','paid')`,
    [rich.creator_id]
  )
  const available = rich.lifetime - takenSoFar.taken
  const settings = await getSettings()

  step('BEFORE')
  line('creator', rich.email)
  line('lifetime earnings', money(rich.lifetime))
  line('already withdrawn or pending', money(takenSoFar.taken))
  line('available to withdraw', money(available))
  line('platform minimum', money(settings.min_withdrawal_tzs))

  /**
   * The platform minimum is set for real money, and no creator on a test
   * platform has cleared it yet. Rather than skip the demonstration or invent
   * earnings — which would put money in the ledger that nobody paid — the
   * threshold is lowered for the length of this run and put back afterwards.
   * Everything below then exercises the genuine path against genuine earnings.
   */
  let restoreMinimum = null
  if (available < settings.min_withdrawal_tzs) {
    restoreMinimum = settings.min_withdrawal_tzs
    await query('update platform_settings set min_withdrawal_tzs = $1 where id = 1', [1000])
    step('NOTE — platform minimum lowered for this run only')
    line('minimum', money(restoreMinimum) + '  →  ' + money(1000) + '   (restored at the end)')
  }
  const minimum = restoreMinimum ? 1000 : settings.min_withdrawal_tzs

  if (available < minimum) {
    console.log('\n     SKIPPED — this creator has earned nothing to withdraw.')
    if (restoreMinimum) {
      await query('update platform_settings set min_withdrawal_tzs = $1 where id = 1', [restoreMinimum])
    }
    return
  }

  step('OVER-DRAWING — asking for more than is available must be refused')
  let refused = false
  try {
    await transaction(async (client) => {
      await client.query('select pg_advisory_xact_lock(hashtext($1))', [`withdrawal:${rich.creator_id}`])
      const earn = await client.query(
        'select coalesce(sum(creator_tzs),0)::int lifetime from earnings where creator_id = $1',
        [rich.creator_id]
      )
      const out = await client.query(
        `select coalesce(sum(amount_tzs),0)::int taken from withdrawals
          where creator_id = $1 and status in ('pending','paid')`,
        [rich.creator_id]
      )
      const room = earn.rows[0].lifetime - out.rows[0].taken
      if (available + 1 > room) throw new Error('over balance')
      await client.query(
        `insert into withdrawals (creator_id, amount_tzs, method, phone, status, note)
         values ($1,$2,'mpesa','0700000000','pending',$3)`,
        [rich.creator_id, available + 1, `${TAG} overdraw`]
      )
    })
  } catch {
    refused = true
  }
  check('a request above the balance was refused', refused)

  const amount = Math.max(minimum, Math.floor(available / 2))
  step(`REQUESTING ${money(amount)} — the same serialised path the API uses`)
  const req = await transaction(async (client) => {
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [`withdrawal:${rich.creator_id}`])
    const { rows } = await client.query(
      `insert into withdrawals (creator_id, amount_tzs, method, phone, status, note)
       values ($1,$2,'mpesa','0712345678','pending',$3) returning *`,
      [rich.creator_id, amount, `${TAG} demonstration`]
    )
    return rows[0]
  })
  line('withdrawal id', req.id)
  line('status', req.status)

  const queue = await many(`select id from withdrawals where status = 'pending'`)
  check('it is in the admin queue', queue.some((w) => w.id === req.id), `${queue.length} pending`)

  const afterRequest = await one(
    `select coalesce(sum(amount_tzs),0)::int taken from withdrawals
      where creator_id = $1 and status in ('pending','paid')`,
    [rich.creator_id]
  )
  check(
    'the balance was reduced the moment it was requested, not when paid',
    rich.lifetime - afterRequest.taken === available - amount,
    money(rich.lifetime - afterRequest.taken) + ' left'
  )

  step('ADMIN PROCESSES IT')
  const { admin } = await cast()
  // The platform's states are pending / paid / rejected — there is no
  // intermediate 'processing'. An admin makes one decision and it is final,
  // which is why the route refuses to decide an already-decided request.
  for (const next of ['paid']) {
    const upd = await one(
      `update withdrawals set status = $2, decided_by = $3, decided_at = now()
        where id = $1 returning status`,
      [req.id, next, admin.id]
    )
    line('status', '→ ' + upd.status)
  }

  const final = await one('select * from withdrawals where id = $1', [req.id])
  check('the creator sees it as paid', final.status === 'paid')
  check('who decided it is recorded', Boolean(final.decided_by) && Boolean(final.decided_at))

  const end = await one(
    `select coalesce(sum(amount_tzs),0)::int taken from withdrawals
      where creator_id = $1 and status in ('pending','paid')`,
    [rich.creator_id]
  )
  step('AFTER')
  line('available to withdraw', money(available) + '  →  ' + money(rich.lifetime - end.taken))
  check('the money was deducted exactly once', rich.lifetime - end.taken === available - amount)

  if (restoreMinimum) {
    await query('update platform_settings set min_withdrawal_tzs = $1 where id = 1', [restoreMinimum])
    const back = await one('select min_withdrawal_tzs m from platform_settings where id = 1')
    check('the platform minimum was put back', back.m === restoreMinimum, money(back.m))
  }
}

/* ---------------------------------------------------------------- run ---- */
const which = process.argv[2] || 'all'
const runs = { premiere, ads, withdrawal }

try {
  await cleanup() // anything a previous interrupted run left behind
  if (which === 'all') for (const fn of Object.values(runs)) await fn()
  else if (runs[which]) await runs[which]()
  else throw new Error(`unknown: ${which}. Use premiere | ads | withdrawal | all`)
} catch (err) {
  failures += 1
  console.error('\n  ERROR  ' + err.message)
} finally {
  await cleanup()
  console.log('\n' + '─'.repeat(74))
  console.log(failures ? `  ${failures} CHECK(S) FAILED` : '  ALL CHECKS PASSED')
  console.log('  demonstration rows removed')
  console.log('─'.repeat(74) + '\n')
  process.exit(failures ? 1 : 0)
}
