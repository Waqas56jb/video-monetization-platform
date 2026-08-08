#!/usr/bin/env node
/**
 * Check that outbound email actually works.
 *
 *   node src/cli/mail.js                 verify the SMTP credentials only
 *   node src/cli/mail.js you@example.com send a real test message
 */
import { verifyMail, sendMail, passwordResetEmail } from '../lib/mailer.js'
import { env, capabilities } from '../config/env.js'
import { log } from '../lib/logger.js'

const to = process.argv[2]

console.log('\n\x1b[35m  MTONYO+ \x1b[0m email check\n')

if (!capabilities.email) {
  log.error('SMTP is not configured — set SMTP_HOST, SMTP_USER and SMTP_PASS in server/.env')
  process.exit(1)
}

console.log(`  host: ${env.smtp.host}:${env.smtp.port} (secure: ${env.smtp.secure})`)
console.log(`  from: ${env.smtp.from}\n`)

try {
  await verifyMail()
  log.ok('credentials accepted by the mail server')

  if (to) {
    const tpl = passwordResetEmail({
      name: 'there',
      url: `${env.publicWebUrl}/reset?token=EXAMPLE-ONLY`,
      minutes: env.tokens.resetMinutes,
    })
    await sendMail({ to, subject: `[test] ${tpl.subject}`, html: tpl.html })
    log.ok(`test message delivered to ${to}`)
  } else {
    console.log('\n  Pass an address to send a real message: npm run mail:test you@example.com\n')
  }
} catch (err) {
  log.error(err.message)
  process.exitCode = 1
}
