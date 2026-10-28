import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyVisit, captureTrafficSource, currentTrafficSource } from './trafficSource.js'

const ORIGIN = 'https://mtonyo.example'
const UA_CHROME = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36'

test('explicit link tags win, with aliases', () => {
  assert.equal(classifyVisit({ search: '?utm_source=WA&utm_campaign=Launch-Oct' }).source, 'whatsapp')
  assert.equal(classifyVisit({ search: '?utm_source=WA&utm_campaign=Launch-Oct' }).campaign, 'launch-oct')
  assert.equal(classifyVisit({ search: '?via=ig' }).source, 'instagram')
  assert.equal(classifyVisit({ search: '?ref=tt' }).source, 'tiktok')
  assert.equal(classifyVisit({ search: '?utm_source=fb', userAgent: 'Instagram 300' }).source, 'facebook', 'the tag beats the in-app browser')
})

test('an unknown tag is "other", and the tag is kept as the campaign', () => {
  const v = classifyVisit({ search: '?utm_source=radio-efm' })
  assert.deepEqual([v.source, v.campaign], ['other', 'radio-efm'])
})

test('in-app browsers', () => {
  assert.equal(classifyVisit({ userAgent: `${UA_CHROME} [FBAN/FB4A;FBAV/450.0]` }).source, 'facebook')
  assert.equal(classifyVisit({ userAgent: `${UA_CHROME} Instagram 312.0.0` }).source, 'instagram')
  assert.equal(classifyVisit({ userAgent: `${UA_CHROME} musical_ly_2023 BytedanceWebview/d8a21c6` }).source, 'tiktok')
})

test('referrers: web hosts and Android app referrers', () => {
  assert.equal(classifyVisit({ referrer: 'android-app://com.whatsapp/' }).source, 'whatsapp')
  assert.equal(classifyVisit({ referrer: 'android-app://com.whatsapp.w4b/' }).source, 'whatsapp')
  assert.equal(classifyVisit({ referrer: 'https://l.facebook.com/l.php?u=x' }).source, 'facebook')
  assert.equal(classifyVisit({ referrer: 'https://t.co/abc' }).source, 'twitter')
  assert.equal(classifyVisit({ referrer: 'https://www.google.co.tz/' }).source, 'search')
  const blog = classifyVisit({ referrer: 'https://someblog.co.tz/post/1?token=secret' })
  assert.deepEqual([blog.source, blog.referrer], ['other', 'someblog.co.tz'], 'host only, never the path or query')
})

test('nothing at all is direct; our own pages are internal', () => {
  assert.equal(classifyVisit({ userAgent: UA_CHROME }).source, 'direct')
  assert.equal(classifyVisit({ referrer: `${ORIGIN}/explore`, origin: ORIGIN }).internal, true)
})

test('garbage never throws', () => {
  for (const referrer of ['not a url', '::::', 'javascript:alert(1)', '']) assert.ok(classifyVisit({ referrer }).source)
  assert.equal(classifyVisit({ search: '?utm_source=%3Cscript%3E' }).source, 'other')
  assert.ok(classifyVisit({ search: '?utm_source=' + 'a'.repeat(5000) }).campaign.length <= 80)
  assert.ok(classifyVisit().source)
})

const fakeWin = ({ search = '', referrer = '', ua = UA_CHROME, store = new Map(), broken = false } = {}) => ({
  location: { search, origin: ORIGIN },
  document: { referrer },
  navigator: { userAgent: ua },
  get localStorage() {
    if (broken) throw new Error('SecurityError')
    return { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) }
  },
})

test('first touch from WhatsApp survives a later direct visit and in-site reloads', () => {
  const store = new Map()
  captureTrafficSource(fakeWin({ referrer: 'android-app://com.whatsapp/', store }))
  captureTrafficSource(fakeWin({ store }))                                    // typed the URL next day
  captureTrafficSource(fakeWin({ referrer: `${ORIGIN}/watch/x`, store }))     // reload / in-site nav
  assert.equal(currentTrafficSource(fakeWin({ store })).source, 'whatsapp')
  captureTrafficSource(fakeWin({ search: '?utm_source=tiktok', store }))      // a NEW channel replaces it
  assert.equal(currentTrafficSource(fakeWin({ store })).source, 'tiktok')
})

test('an old source expires after 7 days; blocked storage means "not recorded", never a crash', () => {
  const store = new Map([['mtonyo.trafficSource', JSON.stringify({ source: 'facebook', at: Date.now() - 8 * 864e5 })]])
  assert.equal(currentTrafficSource(fakeWin({ store })), null)
  store.set('mtonyo.trafficSource', '{corrupt')
  assert.equal(currentTrafficSource(fakeWin({ store })), null)
  assert.doesNotThrow(() => captureTrafficSource(fakeWin({ broken: true })))
  assert.equal(currentTrafficSource(fakeWin({ broken: true })), null)
})
