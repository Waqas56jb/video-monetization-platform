#!/usr/bin/env node
/**
 * Create the Cloudflare Stream signing key used for paywalled playback.
 * Run once, then paste the two values into server/.env.
 */
import { createSigningKey } from '../lib/cloudflare.js'
import { log } from '../lib/logger.js'

try {
  const key = await createSigningKey()
  console.log('\n  Add these to server/.env:\n')
  console.log(`  CLOUDFLARE_STREAM_KEY_ID=${key.id}`)
  console.log(`  CLOUDFLARE_STREAM_KEY_PEM=${key.pem}\n`)
  log.warn('The PEM is a private key — keep it out of git and out of the browser.')
} catch (err) {
  log.error(err.message)
  process.exitCode = 1
}
