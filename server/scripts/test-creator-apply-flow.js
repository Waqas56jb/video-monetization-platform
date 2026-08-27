#!/usr/bin/env node
/**
 * Creator-application flow against a running API.
 *
 *   node scripts/test-creator-apply-flow.js
 *   node scripts/test-creator-apply-flow.js https://video-monetization-platform-server.vercel.app
 *
 * Registers a throwaway viewer (even when asking for Create), submits the
 * full application, and checks that the studio is still closed.
 */
const BASE = (process.argv[2] || process.env.API_URL || 'http://localhost:4000').replace(/\/$/, '')

const stamp = Date.now()
const email = `applytest.${stamp}@gmail.com`
const password = 'TestApply1!'

function fail(step, got) {
  console.error(`FAIL  ${step}`)
  console.error(got)
  process.exit(1)
}

async function req(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    json = { raw: text }
  }
  return { status: res.status, json }
}

const application = {
  fullName: 'Asha Test',
  stageName: 'Asha Live',
  email,
  phone: '0712345678',
  location: 'Dar es Salaam, Tanzania',
  contentType: 'Live recordings',
  category: 'Concerts',
  bio: 'I record live music in Dar and want a place my audience can pay for the full set.',
  description: 'Full concert recordings and behind-the-scenes cuts from shows I already film.',
  whyJoin: 'I want a home for paid premieres of my concerts instead of giving the whole set away on social.',
  followers: '18,000 on Instagram, 9,000 on TikTok',
  engagement: 'Around 4% average, 6–10k typical views on Reels',
  socials: ['https://instagram.com/ashalive', 'https://tiktok.com/@ashalive'],
  sampleWork: ['https://youtube.com/watch?v=dQw4w9WgXcQ'],
  acceptTerms: true,
}

const run = async () => {
  console.log(`API  ${BASE}`)
  console.log(`user ${email}`)

  const health = await req('GET', '/health')
  if (health.status !== 200 || !health.json?.ok) fail('health', health)

  const registered = await req('POST', '/api/auth/register', {
    body: {
      email,
      password,
      fullName: 'Asha Test',
      phone: '0712345678',
      role: 'creator',
      side: 'creator',
    },
  })
  if (registered.status !== 201 && registered.status !== 200) fail('register', registered)
  if (registered.json.user?.role !== 'viewer') {
    fail('register must stay a viewer', registered.json.user)
  }
  if (!registered.json.needsCreatorApplication) {
    fail('register must flag needsCreatorApplication', registered.json)
  }
  if (registered.json.sides?.creator) {
    fail('register must not open the creator side', registered.json.sides)
  }
  const token = registered.json.session?.accessToken
  if (!token) fail('register session', registered.json)

  const become = await req('POST', '/api/auth/become-creator', { token })
  if (become.status < 400) fail('become-creator must refuse', become)

  const creatorLogin = await req('POST', '/api/auth/login', {
    body: { email, password, side: 'creator' },
  })
  if (creatorLogin.status !== 403 || creatorLogin.json?.error?.code !== 'WRONG_SIDE') {
    fail('creator login must be WRONG_SIDE until approved', creatorLogin)
  }

  const applied = await req('POST', '/api/account/creator-application', {
    token,
    body: application,
  })
  if (applied.status !== 201) fail('apply', applied)
  if (applied.json.application?.status !== 'pending') fail('apply pending', applied.json)

  const mine = await req('GET', '/api/account/creator-application', { token })
  if (mine.status !== 200) fail('read application', mine)
  const app = mine.json.application
  if (app.status !== 'pending') fail('stored status', app)
  if (app.stageName !== 'Asha Live') fail('stage name', app)
  if (app.contentType !== 'Live recordings') fail('content type', app)
  if (app.location !== 'Dar es Salaam, Tanzania') fail('location', app)
  if (app.whyJoin?.length < 30) fail('why join', app)

  const me = await req('GET', '/api/auth/me', { token })
  if (me.json.user?.role !== 'viewer') fail('still a viewer after apply', me.json.user)
  if (me.json.sides?.creator) fail('studio still closed after apply', me.json.sides)

  console.log('OK   Create signup stays a viewer')
  console.log('OK   Instant become-creator is refused')
  console.log('OK   Creator login is blocked until approval')
  console.log('OK   Application is pending with assessment fields')
  console.log(`id   ${app.id}`)

  const adminEmail = process.env.UI_ADMIN_EMAIL || 'admin@mtonyo.tz'
  const adminPassword = process.env.UI_ADMIN_PASSWORD || 'Mtonyo!Admin2026'
  const adminLogin = await req('POST', '/api/auth/login', {
    body: { email: adminEmail, password: adminPassword, side: 'viewer' },
  })

  const moderatorLogin = await req('POST', '/api/auth/login', {
    body: { email: 'demo.moderator@mtonyo.demo', password: 'DemoPass123!', side: 'viewer' },
  })
  if (moderatorLogin.status === 200 && moderatorLogin.json?.session?.accessToken) {
    const steal = await req('POST', `/api/admin/creator-applications/${app.id}/decide`, {
      token: moderatorLogin.json.session.accessToken,
      body: { decision: 'approve', note: 'should be refused' },
    })
    if (steal.status < 400) fail('reviewer must not approve creator applications', steal)
    console.log('OK   Reviewer cannot approve creator applications')
  }

  if (adminLogin.status !== 200 || !adminLogin.json?.session?.accessToken) {
    console.log('SKIP admin approve/decline (staff password is not the documented demo one in this environment)')
    return
  }
  const adminToken = adminLogin.json.session.accessToken
  const adminRole = adminLogin.json.user?.role
  if (adminRole !== 'admin' && adminRole !== 'sub_admin') {
    fail('admin role', adminLogin.json.user)
  }

  const queue = await req('GET', '/api/admin/creator-applications?status=pending', {
    token: adminToken,
  })
  if (queue.status !== 200) fail('admin pending queue', queue)
  const pendingList = queue.json?.applications || []
  if (!pendingList.some((row) => row.id === app.id)) {
    fail('pending application visible to admin', { id: app.id, pending: pendingList.length })
  }

  const decided = await req('POST', `/api/admin/creator-applications/${app.id}/decide`, {
    token: adminToken,
    body: { decision: 'approve', note: 'Milestone 2 audit — approve test account' },
  })
  if (decided.status !== 200) fail('admin approve', decided)
  if (decided.json?.application?.status !== 'approved') fail('approve status', decided.json)

  const creatorOk = await req('POST', '/api/auth/login', {
    body: { email, password, side: 'creator' },
  })
  if (creatorOk.status !== 200) fail('creator login after approve', creatorOk)
  if (creatorOk.json.user?.role !== 'creator') fail('role is creator after approve', creatorOk.json.user)
  if (!creatorOk.json.sides?.creator) fail('creator side open after approve', creatorOk.json)

  const declinedUser = `applytest.decline.${stamp}@gmail.com`
  const declinedReg = await req('POST', '/api/auth/register', {
    body: {
      email: declinedUser,
      password,
      fullName: 'Bora Test',
      phone: '0712345679',
      role: 'creator',
      side: 'creator',
    },
  })
  if (declinedReg.status !== 201 && declinedReg.status !== 200) fail('decline-case register', declinedReg)
  const declinedToken = declinedReg.json.session?.accessToken
  const declinedApp = await req('POST', '/api/account/creator-application', {
    token: declinedToken,
    body: { ...application, email: declinedUser, stageName: 'Bora Live', fullName: 'Bora Test' },
  })
  if (declinedApp.status !== 201) fail('decline-case apply', declinedApp)
  const declineId = declinedApp.json.application?.id
  const rejected = await req('POST', `/api/admin/creator-applications/${declineId}/decide`, {
    token: adminToken,
    body: { decision: 'reject', note: 'Milestone 2 audit — decline path' },
  })
  if (rejected.status !== 200 && rejected.status !== 201) fail('admin decline', rejected)
  const stillViewer = await req('GET', '/api/auth/me', { token: declinedToken })
  if (stillViewer.json.user?.role !== 'viewer') fail('declined stays viewer', stillViewer.json.user)
  const stillBlocked = await req('POST', '/api/auth/login', {
    body: { email: declinedUser, password, side: 'creator' },
  })
  if (stillBlocked.status !== 403 || stillBlocked.json?.error?.code !== 'WRONG_SIDE') {
    fail('declined creator login still blocked', stillBlocked)
  }

  console.log('OK   Admin can see the pending application')
  console.log('OK   Approve opens creator access')
  console.log('OK   Decline leaves the account as a viewer')
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
