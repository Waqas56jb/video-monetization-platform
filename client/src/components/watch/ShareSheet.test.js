import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./ShareSheet.jsx', import.meta.url), 'utf8')

/**
 * report2.txt SEP12 §A: a `whatsapp://` link fails SILENTLY on desktop when
 * the app is not installed — measured against a Mac profile, nothing at all
 * appears (no dialog, no prompt) until the fallback used to show, 1.5s
 * later. The client's third report of the same "sharing on desktop not
 * working" complaint traced to exactly this: a button that visibly does
 * nothing long enough to read as broken. The fallback must now appear the
 * instant the click happens, not after a delay.
 */
test('the desktop WhatsApp fallback appears immediately on click, not after the 1.5s timer', () => {
  const fn = src.slice(src.indexOf('const onWhatsApp = () => {'), src.indexOf('const onFacebookClick'))
  // setWaFallback(true) must run synchronously in the click handler, before
  // the setTimeout is ever scheduled — not inside the timer's own callback.
  const beforeTimer = fn.slice(0, fn.indexOf('setTimeout('))
  assert.match(beforeTimer, /setWaFallback\(true\)/, 'setWaFallback(true) must run before the setTimeout is scheduled, not inside it')
})

test('the 1.5s timer only ever clears the fallback (on a confirmed app hand-off), never sets it', () => {
  const fn = src.slice(src.indexOf('const onWhatsApp = () => {'), src.indexOf('const onFacebookClick'))
  const timerBody = fn.slice(fn.indexOf('setTimeout('))
  assert.doesNotMatch(timerBody, /setWaFallback\(true\)/, 'the timer must not be what makes the fallback appear')
  assert.match(timerBody, /if \(left\) setWaFallback\(false\)/)
})

test('the fallback text is worded as a question, not a confirmed failure, since it now shows before we know which', () => {
  assert.match(src, /Opening WhatsApp… not installed\? Open WhatsApp Web/)
  assert.doesNotMatch(src, /WhatsApp app not found/)
})

test('a phone (which self-redirects via whatsappFallback) and a non-desktop device both clear any stale fallback state', () => {
  const fn = src.slice(src.indexOf('const onWhatsApp = () => {'), src.indexOf('const onFacebookClick'))
  assert.match(fn, /if \(whatsappIsPhone\(\)\) \{\s*\n\s*setWaFallback\(false\)/)
  assert.match(fn, /if \(!whatsappNeedsVisibleFallback\(\)\) \{\s*\n\s*setWaFallback\(false\)/)
})
