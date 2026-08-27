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
}

run().catch((err) => {
  console.error(err)
  process.exit(1)
})
