import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

/**
 * Milestone 3, AirPay hosted checkout: the browser leaves for AirPay's page and
 * comes back to /watch/<slug>?payment=<id>; the sheet picks the payment up and
 * playback resumes from where the preview stopped. Source checks, like the
 * other sheet tests — the component itself needs a DOM.
 */
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const modal = read('./PaymentModal.jsx')
const watch = read('../../pages/Watch.jsx')

test('a redirect response posts a real top-level form and does not start a phone-prompt poll', () => {
  const pay = modal.slice(modal.indexOf('const pay = async'), modal.indexOf('return (', modal.indexOf('const pay = async')))
  const branch = pay.slice(pay.indexOf('if (res.redirect?.url)'), pay.indexOf('watch(res.payment.id)'))
  assert.match(branch, /setStep\('redirecting'\)/)
  assert.match(branch, /onBeforeLeave\?\.\(res\.payment\)/)
  assert.match(branch, /submitHostedCheckout\(res\.redirect\)/)
  assert.match(branch, /return\n/)
  const fn = modal.slice(modal.indexOf('export function submitHostedCheckout'), modal.indexOf('export default function PaymentModal'))
  assert.match(fn, /input\.type = 'hidden'/)
  assert.match(fn, /form\.submit\(\)/)
})

test('the position is saved before leaving, and the return reopens the same payment', () => {
  assert.match(watch, /onBeforeLeave=\{capturePosition\}/)
  assert.match(watch, /resumePaymentId=\{returnedPaymentId\}/)
  assert.match(watch, /get\('payment'\)/)
  assert.match(watch, /\/\^\[0-9a-f-\]\{36\}\$\/i\.test/, 'only a payment id shape is accepted from the address')
  assert.match(watch, /params\.delete\('payment'\)/, 'a reload or a shared address does not reopen it')
  assert.match(modal, /setHosted\(true\)\n\s+setStep\('waiting'\)\n\s+watch\(resumePaymentId\)/)
})

test('a return that is already verified just plays — no sheet', () => {
  const e = watch.slice(watch.indexOf('if (!returnedPaymentId || !accessReady) return'), watch.indexOf('// Owned / free videos must never keep'))
  assert.match(e, /if \(locked\) \{\n\s+setPayOpen\(true\)/)
  assert.match(e, /Payment confirmed/)
})
