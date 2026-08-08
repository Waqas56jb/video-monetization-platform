import nodemailer from 'nodemailer'
import { env } from '../config/env.js'
import { log } from './logger.js'
import { serviceUnavailable } from './errors.js'

/**
 * Outbound email.
 *
 * The platform sends its own mail rather than leaning on the auth provider's
 * built-in mailer, which is rate limited to a couple of messages an hour — fine
 * for a demo, useless for real people who forget their password on a Sunday.
 *
 * Everything here degrades honestly: if SMTP is not configured the API still
 * runs, and the endpoints that need mail say exactly what is missing instead of
 * silently pretending a message went out.
 */

let transport = null

function getTransport() {
  if (!env.smtp.host || !env.smtp.user || !env.smtp.pass) {
    throw serviceUnavailable(
      'Email is not configured. Set SMTP_HOST, SMTP_USER and SMTP_PASS in server/.env'
    )
  }
  if (!transport) {
    transport = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure, // 465 = implicit TLS; 587 upgrades with STARTTLS
      auth: { user: env.smtp.user, pass: env.smtp.pass },
      pool: true,
      maxConnections: 3,
      // Gmail throttles hard on bursts; three at a time keeps us well inside it.
      rateDelta: 1000,
      rateLimit: 5,
    })
  }
  return transport
}

/** Prove the credentials work, without sending anything. */
export async function verifyMail() {
  await getTransport().verify()
  return { ok: true, host: env.smtp.host, from: env.smtp.from }
}

export async function sendMail({ to, subject, html, text }) {
  const info = await getTransport().sendMail({
    from: env.smtp.from,
    to,
    subject,
    text: text || stripTags(html),
    html,
  })
  log.info(`mail sent to ${to} — ${info.messageId}`)
  return info
}

const stripTags = (html = '') =>
  html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|h1|h2|h3)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

/* ------------------------------------------------------------- templates */

const BRAND = '#E9B949'
const INK = '#0B0B0F'

/**
 * One shell for every message so they arrive looking like the same platform.
 * Deliberately table-and-inline-styles: that is still what survives Gmail,
 * Outlook and the stock Android client intact.
 */
function shell({ heading, intro, buttonLabel, buttonUrl, footNote, afterButton }) {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f4f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f6;padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.06);">

        <tr><td style="background:${INK};padding:22px 28px;">
          <span style="color:#ffffff;font-size:20px;font-weight:800;letter-spacing:.06em;">MTONYO</span><span style="color:${BRAND};font-size:20px;font-weight:800;">+</span>
        </td></tr>

        <tr><td style="padding:30px 28px 8px;">
          <h1 style="margin:0 0 12px;font-size:21px;line-height:1.3;color:${INK};">${heading}</h1>
          <p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#4a4a55;">${intro}</p>
        </td></tr>

        ${
          buttonUrl
            ? `<tr><td align="center" style="padding:0 28px 8px;">
          <a href="${buttonUrl}" style="display:inline-block;background:${BRAND};color:${INK};text-decoration:none;font-weight:700;font-size:15px;padding:14px 30px;border-radius:10px;">${buttonLabel}</a>
        </td></tr>
        <tr><td style="padding:16px 28px 0;">
          <p style="margin:0;font-size:12px;line-height:1.6;color:#8a8a96;">If the button does not work, copy this address into your browser:<br>
            <span style="color:#4a4a55;word-break:break-all;">${buttonUrl}</span></p>
        </td></tr>`
            : ''
        }

        ${afterButton || ''}

        <tr><td style="padding:24px 28px 30px;">
          <hr style="border:none;border-top:1px solid #ececed;margin:0 0 16px;">
          <p style="margin:0;font-size:12px;line-height:1.6;color:#8a8a96;">${footNote}</p>
        </td></tr>

      </table>
      <p style="margin:16px 0 0;font-size:11px;color:#a0a0ab;">MTONYO+ &middot; Tanzania</p>
    </td></tr>
  </table>
</body></html>`
}

export function passwordResetEmail({ name, url, minutes }) {
  return {
    subject: 'Reset your MTONYO+ password',
    html: shell({
      heading: `Hi${name ? ' ' + escapeHtml(name) : ''}, let's get you back in`,
      intro: `Someone asked to reset the password on this MTONYO+ account. Choose a new one with the button below — the link works once and expires in ${minutes} minutes.`,
      buttonLabel: 'Set a new password',
      buttonUrl: url,
      footNote:
        'If you did not ask for this, you can ignore this email — your password stays as it is, and nobody can get in from this message alone.',
    }),
  }
}

export function staffInviteEmail({ name, url, hours, invitedBy }) {
  return {
    subject: "You've been added to the MTONYO+ moderation team",
    html: shell({
      heading: `Welcome${name ? ', ' + escapeHtml(name) : ''}`,
      intro: `${escapeHtml(invitedBy || 'An administrator')} has given you a sub-admin account on MTONYO+. Choose your own password to activate it — nobody else ever sees it, not even the administrator who invited you. This link expires in ${hours} hours.`,
      buttonLabel: 'Choose your password',
      buttonUrl: url,
      footNote:
        'As a sub-admin you review and publish content, decide withdrawals and post announcements. Account management stays with the administrator.',
    }),
  }
}

export function announcementEmail({ title, body, fromName }) {
  return {
    subject: title,
    html: shell({
      heading: escapeHtml(title),
      intro: escapeHtml(body).replace(/\n/g, '<br>'),
      footNote: `Sent by ${escapeHtml(fromName || 'the MTONYO+ team')}. You are receiving this because you have an MTONYO+ account.`,
    }),
  }
}

export function passwordChangedEmail({ name }) {
  return {
    subject: 'Your MTONYO+ password was changed',
    html: shell({
      heading: `Hi${name ? ' ' + escapeHtml(name) : ''}, your password has changed`,
      intro:
        'The password on your MTONYO+ account was just changed. If that was you, there is nothing to do.',
      footNote:
        'If it was not you, reset your password immediately from the login page — that will lock out whoever made the change.',
    }),
  }
}

const escapeHtml = (s = '') =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  )
