#!/usr/bin/env node
/**
 * The addresses to give AirPay for the merchant, from this environment.
 *
 *   npm run airpay:urls
 *
 * Run it with the production PUBLIC_WEB_URL and SERVER_PUBLIC_URL (after a
 * domain move, the new ones) and paste the result to AirPay. Prints no secret.
 */
import 'dotenv/config'
import { airpayUrls } from '../modules/payments/airpay.js'

const u = airpayUrls()
console.log(`
  Website URL           ${u.website}
  Success Return URL    ${u.success}
  Failure Return URL    ${u.failure}
  Webhook (IPN) URL     ${u.webhook}
`)
if (/vercel\.app|railway\.app|localhost/.test(Object.values(u).join(' '))) {
  console.log('  Note: these are hosting addresses, not the MTONYO+ domain yet.\n')
}
