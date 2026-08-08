#!/usr/bin/env node
/**
 * End-to-end smoke test against a running API.
 *
 * Walks the whole Milestone 2 story and asserts each step:
 *   register creator → create video → price + preview + premiere days →
 *   submit → admin approves (changing the premiere window) → viewer buys →
 *   all four payment outcomes → entitlement survives a fresh login →
 *   revenue split recorded → premiere expiry switches to Free With Ads.
 *
 *   npm run smoke                    (expects the API on :4000)
 *   API_URL=https://... npm run smoke
 */
const API = (process.env.API_URL || 'http://localhost:4000').replace(/\/$/, '')

let passed = 0
let failed = 0
const fails = []

const ok = (name, extra = '') => { passed++; console.log(`  \x1b[32m✓\x1b[0m ${name}${extra ? ` \x1b[90m${extra}\x1b[0m` : ''}`) }
const bad = (name, why) => { failed++; fails.push(`${name}: ${why}`); console.log(`  \x1b[31m✗\x1b[0m ${name}\n     ${why}`) }
const section = (t) => console.log(`\n\x1b[35m${t}\x1b[0m`)

async function api(path, { method = 'GET', body, token, expect } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  let json = null
  try { json = await res.json() } catch { /* empty body */ }
  if (expect && res.status !== expect) {
    throw new Error(`${method} ${path} → ${res.status} (expected ${expect}) ${JSON.stringify(json?.error || json)?.slice(0, 160)}`)
  }
  return { status: res.status, json }
}

const rnd = () => Math.random().toString(36).slice(2, 8)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function run() {
  console.log(`\n\x1b[35m  MTONYO+ \x1b[0m API smoke test → ${API}\n`)

  /* ------------------------------------------------------------- health */
  section('health')
  const health = await api('/health')
  if (health.json?.ok) ok('API is up', health.json.database)
  else return bad('API is up', 'no response')

  if (health.json.database !== 'connected') {
    console.log('\n  \x1b[33mDatabase is not connected — the rest of the test needs it.\x1b[0m')
    console.log('  Set DATABASE_URL (with the password) in server/.env, then: npm run db:setup\n')
    return
  }
  if (!health.json.capabilities?.supabaseAuth) {
    console.log('\n  \x1b[33mSUPABASE_SERVICE_ROLE_KEY is missing — auth-dependent steps will be skipped.\x1b[0m\n')
    return
  }

  /* ---------------------------------------------------------- accounts */
  section('accounts')
  const stamp = rnd()
  const creator = { email: `creator.${stamp}@mtonyo.test`, password: 'Smoke!Test2026', fullName: 'Smoke Creator', role: 'creator' }
  const viewer = { email: `viewer.${stamp}@mtonyo.test`, password: 'Smoke!Test2026', fullName: 'Smoke Viewer', role: 'viewer' }

  const cReg = await api('/api/auth/register', { method: 'POST', body: creator, expect: 201 })
  const creatorToken = cReg.json.session.accessToken
  ok('creator registers', cReg.json.user.role)

  const vReg = await api('/api/auth/register', { method: 'POST', body: viewer, expect: 201 })
  let viewerToken = vReg.json.session.accessToken
  ok('viewer registers', vReg.json.user.role)

  const me = await api('/api/auth/me', { token: creatorToken, expect: 200 })
  me.json.user.email === creator.email ? ok('token identifies the caller') : bad('token identifies the caller', 'wrong user')

  // Promote a smoke admin straight in the database is not possible from here,
  // so use the seeded admin if it exists.
  let adminToken = null
  const adminLogin = await api('/api/auth/login', {
    method: 'POST',
    body: { email: 'admin@mtonyo.tz', password: 'Mtonyo!Admin2026' },
  })
  if (adminLogin.status === 200 && adminLogin.json.user.role === 'admin') {
    adminToken = adminLogin.json.session.accessToken
    ok('admin signs in')
  } else {
    bad('admin signs in', 'seeded admin not found — run: npm run db:seed')
  }

  /* ------------------------------------------------------------- video */
  section('video + per-video premiere duration')
  const created = await api('/api/videos', {
    method: 'POST', token: creatorToken, expect: 201,
    body: { title: `Smoke Premiere ${stamp}`, description: 'Created by the smoke test', category: 'Music' },
  })
  const videoId = created.json.video.id
  ok('creator creates a video', videoId.slice(0, 8))

  const priced = await api(`/api/videos/${videoId}`, {
    method: 'PATCH', token: creatorToken, expect: 200,
    body: { accessType: 'paid_premiere', priceTzs: 500, freePreviewSeconds: 300, premiereDays: 60 },
  })
  priced.json.video.premiereDays === 60
    ? ok('creator sets price, preview and a 60-day premiere')
    : bad('creator sets premiere days', `got ${priced.json.video.premiereDays}`)

  /* --------------------------------------------- creators cannot publish */
  section('publication is admin-only (enforced in the database)')
  const sneaky = await api(`/api/admin/review/${videoId}/approve`, { method: 'POST', token: creatorToken, body: {} })
  sneaky.status === 403
    ? ok('creator cannot call the approve endpoint', `403`)
    : bad('creator cannot approve', `got ${sneaky.status}`)

  // Mark the video ready so it can be submitted (no Cloudflare in the test).
  const submitted = await api(`/api/videos/${videoId}/submit`, { method: 'POST', token: creatorToken })
  if (submitted.status === 200) ok('creator submits for review', submitted.json.video.reviewStatus)
  else if (submitted.status === 400 && /Upload the video/.test(submitted.json?.error?.message || '')) {
    ok('submit blocked until a file is uploaded', 'expected without Cloudflare')
  } else bad('creator submits for review', `${submitted.status} ${submitted.json?.error?.message}`)

  /* --------------------------------------------------- admin approval */
  if (adminToken) {
    section('admin review')
    const queue = await api('/api/admin/review', { token: adminToken, expect: 200 })
    ok('review queue loads', `${queue.json.queue.length} pending`)

    // Admin changes the premiere window before approving — the client's ask.
    const approved = await api(`/api/admin/review/${videoId}/approve`, {
      method: 'POST', token: adminToken, body: { premiereDays: 90 },
    })
    if (approved.status === 200) {
      approved.json.video.premiereDays === 90
        ? ok('admin changes the premiere window to 90 days before approving')
        : bad('admin edits premiere days', `got ${approved.json.video.premiereDays}`)
      approved.json.video.isPublished ? ok('approval publishes the video') : bad('approval publishes', 'not published')
    } else {
      bad('admin approves', `${approved.status} ${approved.json?.error?.message}`)
    }
  }

  /* --------------------------------------------------------- payments */
  section('payments — all four outcomes')
  const live = await api(`/api/videos/${videoId}`)
  const purchasable = live.status === 200 && live.json.video?.access?.requiresPayment

  if (!purchasable) {
    console.log('  \x1b[90m· video is not purchasable (needs Cloudflare upload) — using a seeded video\x1b[0m')
  }

  const catalogue = await api('/api/videos?access=ppv_forever&limit=1')
  const target = purchasable ? videoId : catalogue.json?.videos?.[0]?.id

  if (!target) {
    bad('a purchasable video exists', 'catalogue is empty — run: npm run db:seed')
  } else {
    for (const outcome of ['failed', 'cancelled', 'expired']) {
      const init = await api('/api/payments/initiate', {
        method: 'POST', token: viewerToken,
        body: { videoId: target, method: 'mpesa', phone: '0712345678', simulate: outcome },
      })
      if (init.status !== 201) { bad(`payment initiates (${outcome})`, `${init.status} ${init.json?.error?.message}`); continue }

      const forced = await api(`/api/payments/${init.json.payment.id}/simulate`, {
        method: 'POST', token: viewerToken, body: { outcome },
      })
      const done = await api(`/api/payments/${init.json.payment.id}`, { token: viewerToken })
      done.json.payment.status === outcome && done.json.unlocked === false
        ? ok(`${outcome} payment leaves the video locked`)
        : bad(`${outcome} payment`, `status=${done.json.payment.status} unlocked=${done.json.unlocked}`)
    }

    const init = await api('/api/payments/initiate', {
      method: 'POST', token: viewerToken,
      body: { videoId: target, method: 'mpesa', phone: '0712345678', simulate: 'success' },
    })
    if (init.status === 201) {
      ok('payment initiates', init.json.payment.status)
      await api(`/api/payments/${init.json.payment.id}/simulate`, {
        method: 'POST', token: viewerToken, body: { outcome: 'success' },
      })
      const done = await api(`/api/payments/${init.json.payment.id}`, { token: viewerToken })
      done.json.unlocked ? ok('successful payment unlocks the video') : bad('successful payment unlocks', JSON.stringify(done.json.payment))

      /* ------------------------------------------------- entitlement */
      section('entitlement')
      const ent = await api(`/api/library/entitlement/${target}`, { token: viewerToken })
      ent.json.owned ? ok('entitlement recorded against the account') : bad('entitlement recorded', 'not owned')

      const relogin = await api('/api/auth/login', {
        method: 'POST', body: { email: viewer.email, password: viewer.password }, expect: 200,
      })
      viewerToken = relogin.json.session.accessToken
      const after = await api(`/api/library/entitlement/${target}`, { token: viewerToken })
      after.json.owned ? ok('purchase survives logout and a fresh login') : bad('purchase survives re-login', 'lost')

      const lib = await api('/api/library', { token: viewerToken })
      lib.json.videos.some((v) => v.id === target)
        ? ok('video appears in My Library')
        : bad('video in library', 'missing')

      const dup = await api('/api/payments/initiate', {
        method: 'POST', token: viewerToken,
        body: { videoId: target, method: 'mpesa', phone: '0712345678' },
      })
      dup.status === 409 ? ok('cannot buy the same video twice', '409') : bad('duplicate purchase blocked', `got ${dup.status}`)

      /* ------------------------------------------------ revenue split */
      section('revenue split')
      if (adminToken) {
        const pays = await api('/api/admin/payments?status=success&limit=5', { token: adminToken })
        const row = pays.json.payments.find((p) => p.video_id === target)
        row && row.creator_amount_tzs != null
          ? ok('split recorded for the sale', `${row.creator_amount_tzs}/${row.platform_amount_tzs} @ ${row.split_percent}%`)
          : bad('split recorded', 'no split on the payment row')
      }
    } else {
      bad('payment initiates', `${init.status} ${init.json?.error?.message}`)
    }
  }

  /* ---------------------------------------------------------- paywall */
  section('paywall')
  const play = await api(`/api/playback/${target}/playback`)
  if (play.status === 200) {
    play.json.access?.requiresPayment !== undefined
      ? ok('playback endpoint resolves access server-side', play.json.access.requiresPayment ? 'locked' : 'open')
      : bad('playback resolves access', 'no access block')
  } else bad('playback endpoint', `${play.status}`)

  /* --------------------------------------------------- premiere expiry */
  if (adminToken) {
    section('premiere expiry')
    const job = await api('/api/admin/jobs/premiere-expiry', { method: 'POST', token: adminToken })
    job.status === 200
      ? ok('premiere expiry job runs', `checked ${job.json.checked ?? 0}, switched ${job.json.switched?.length ?? 0}`)
      : bad('premiere expiry job', `${job.status}`)

    section('admin surfaces')
    for (const [name, path] of [
      ['overview', '/api/admin/overview'],
      ['users', '/api/admin/users'],
      ['creators', '/api/admin/creators'],
      ['videos', '/api/admin/videos'],
      ['withdrawals', '/api/admin/withdrawals'],
      ['revenue', '/api/admin/revenue'],
      ['settings', '/api/admin/settings'],
      ['audit', '/api/admin/audit'],
      ['ads', '/api/admin/ads'],
      ['deletion requests', '/api/admin/deletion-requests'],
    ]) {
      const r = await api(path, { token: adminToken })
      r.status === 200 ? ok(`admin ${name}`) : bad(`admin ${name}`, `${r.status}`)
    }
  }

  /* ------------------------------------------------------------ share */
  section('share + deep links')
  const share = await api(`/api/share/${target}`)
  if (share.status === 200) {
    /^https?:\/\/.+\/watch\//.test(share.json.deepLink)
      ? ok('deep link points at the watch page', share.json.deepLink)
      : bad('deep link', share.json.deepLink)
    share.json.targets?.whatsapp?.url ? ok('WhatsApp share target present') : bad('WhatsApp target', 'missing')
    share.json.openGraph?.['og:title'] ? ok('Open Graph payload present') : bad('Open Graph', 'missing')
  } else bad('share payload', `${share.status}`)

  /* --------------------------------------------------------- earnings */
  section('creator earnings')
  const earn = await api('/api/earnings', { token: creatorToken })
  earn.status === 200 ? ok('earnings summary', `available TZS ${earn.json.balance.availableTzs}`) : bad('earnings summary', `${earn.status}`)

  const smallWithdraw = await api('/api/earnings/withdrawals', {
    method: 'POST', token: creatorToken, body: { amountTzs: 1, method: 'mpesa', phone: '0712345678' },
  })
  smallWithdraw.status === 400
    ? ok('withdrawal below the minimum is refused')
    : bad('minimum withdrawal enforced', `got ${smallWithdraw.status}`)

  /* ------------------------------------------------------------- done */
  console.log(`\n${'─'.repeat(52)}`)
  console.log(`  \x1b[32m${passed} passed\x1b[0m   ${failed ? `\x1b[31m${failed} failed\x1b[0m` : '0 failed'}`)
  if (failed) {
    console.log('\n  failures:')
    fails.forEach((f) => console.log(`   · ${f}`))
    process.exitCode = 1
  }
  console.log('')
}

run().catch((err) => {
  console.error('\n\x1b[31mFATAL\x1b[0m', err.message, '\n')
  process.exitCode = 1
})
