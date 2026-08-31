#!/usr/bin/env node
/**
 * Tell Cloudflare where to notify us when a video finishes encoding.
 *
 *   node src/cli/cf-webhook.js                      show the current setting
 *   node src/cli/cf-webhook.js https://api.example  point it at a public URL
 *   node src/cli/cf-webhook.js --remove             stop notifications
 *
 * The webhook is an optimisation, not a requirement: the upload screen polls
 * /api/videos/:id/status as well, so a video still goes from "processing" to
 * "ready" without it. Setting it up simply means the platform hears about it
 * the instant it happens, including for uploads nobody is watching.
 */
import { env, capabilities } from '../config/env.js'
import { log } from '../lib/logger.js'

const arg = process.argv[2]
const BASE = `https://api.cloudflare.com/client/v4/accounts/${env.cloudflare.accountId}/stream/webhook`

const call = async (method, body) => {
  const res = await fetch(BASE, {
    method,
    headers: {
      Authorization: `Bearer ${env.cloudflare.apiToken}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json().catch(() => ({}))

  // Cloudflare answers a GET with 404 when no webhook has ever been set. That
  // is a perfectly ordinary state, not a failure.
  if (res.status === 404 && method === 'GET') return null

  if (!json.success) {
    const detail =
      (json.errors || []).map((e) => e.message).join('; ') ||
      (json.messages || []).map((m) => m.message || m).join('; ') ||
      `HTTP ${res.status}`
    throw new Error(detail)
  }
  return json.result
}

console.log('\n\x1b[35m  MTONYO+ \x1b[0m Cloudflare Stream webhook\n')

if (!capabilities.cloudflareStream) {
  log.error('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN must be set in server/.env')
  process.exit(1)
}

try {
  if (arg === '--remove') {
    await call('DELETE')
    log.ok('webhook removed — encoding status now relies on polling alone')
  } else if (arg) {
    const base = arg.replace(/\/$/, '')
    const url = `${base}/api/playback/webhooks/cloudflare`
    const result = await call('PUT', { notificationUrl: url })

    log.ok(`Cloudflare will now notify ${url}`)
    console.log('\n  Add this to server/.env so we can verify the signature:\n')
    console.log(`  CLOUDFLARE_WEBHOOK_SECRET=${result.secret}\n`)
    log.warn(
      'Without that secret every incoming webhook is ACCEPTED, signed or not — ' +
        'verifyWebhookSignature returns true when it is blank (lib/cloudflare.js). ' +
        'This line used to say "rejected", which is the safe-sounding opposite of ' +
        'what happens, and is probably why it went unset for weeks.'
    )
  } else {
    const current = await call('GET')
    if (current?.notificationUrl) {
      console.log(`  currently notifying: ${current.notificationUrl}`)
      console.log(
        `  secret configured here: ${
          env.cloudflare.webhookSecret
            ? 'yes'
            : 'NO — every unsigned webhook is ACCEPTED until you set it'
        }\n`
      )
      /**
       * Say plainly when Cloudflare is talking to somewhere we do not answer.
       *
       * It was pointed at the retired `-backend` host, which returns
       * DEPLOYMENT_NOT_FOUND, so every encoding notification since it was set
       * had gone nowhere — and the only symptom is uploads relying on the
       * polling fallback, which works, so nothing ever looked broken.
       */
      const expected = `${env.serverPublicUrl.replace(/\/$/, '')}/api/playback/webhooks/cloudflare`
      if (current.notificationUrl !== expected) {
        console.log('  \x1b[33mnotification URL does not match SERVER_PUBLIC_URL\x1b[0m')
        console.log(`    expected: ${expected}`)
        console.log(`    actual:   ${current.notificationUrl}`)
        console.log(`    fix with: npm run cf:webhook ${env.serverPublicUrl}\n`)
      }
    } else {
      console.log('  no webhook set — encoding status is discovered by polling.\n')
      console.log('  To set one up once the API is deployed somewhere public:\n')
      console.log('    npm run cf:webhook https://your-api-domain\n')
    }
  }
} catch (err) {
  log.error(err.message)
  process.exitCode = 1
}
