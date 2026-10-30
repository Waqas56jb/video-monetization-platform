/**
 * Homepage Sponsors — the admin form. Found in the live run on 2026-10-30:
 * the sponsor is created before its image is uploaded, so an image the server
 * refused left the form on "Add sponsor" and a second press made a duplicate.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sponsorImageProblem, SPONSOR_IMAGE_MAX_BYTES } from '../../lib/sponsorImage.js'

const dir = dirname(fileURLToPath(import.meta.url))
const src = readFileSync(join(dir, 'SponsorsTab.jsx'), 'utf8').replace(/\r\n/g, '\n')
const file = (type, size) => ({ type, size })

test('an image the server would refuse is refused before anything is saved', () => {
  assert.equal(sponsorImageProblem(null), null, 'no image is fine')
  for (const t of ['image/jpeg', 'image/png', 'image/webp']) assert.equal(sponsorImageProblem(file(t, 200_000)), null, t)
  assert.match(sponsorImageProblem(file('image/svg+xml', 2000)), /JPEG, PNG or WebP/)
  assert.match(sponsorImageProblem(file('image/gif', 2000)), /JPEG, PNG or WebP/)
  assert.match(sponsorImageProblem(file('', 2000)), /JPEG, PNG or WebP/)
  assert.equal(sponsorImageProblem(file('image/png', SPONSOR_IMAGE_MAX_BYTES)), null, 'exactly 5 MB is allowed')
  assert.match(sponsorImageProblem(file('image/png', SPONSOR_IMAGE_MAX_BYTES + 1)), /limit is 5 MB/)
  assert.match(sponsorImageProblem(file('image/png', 10)), /empty/)
  const save = src.slice(src.indexOf('const save = async'), src.indexOf('const toggle = async'))
  assert.ok(save.indexOf('sponsorImageProblem(image)') < save.indexOf('createSponsor'), 'checked before the sponsor is created')
})

test('if the image upload still fails, the form stays on the saved sponsor — no duplicate on retry', () => {
  const save = src.slice(src.indexOf('const save = async'), src.indexOf('const toggle = async'))
  const onImageError = save.slice(save.indexOf('await api.admin.sponsorImage'), save.indexOf("showToast(editing ? 'Sponsor updated'"))
  assert.match(onImageError, /setEditing\(res\.sponsor\.id\)/)
  assert.match(onImageError, /return/)
  assert.match(onImageError, /Save changes/)
})

test('payments: every row names its gateway; internal test payments are labelled TEST and can be filtered out', () => {
  const pay = readFileSync(join(dir, 'PaymentsTab.jsx'), 'utf8').replace(/\r\n/g, '\n')
  assert.match(pay, /const GATEWAY_FILTER = \{ AirPay: 'airpay', 'Test payments \(no money\)': 'sandbox' \}/)
  assert.match(pay, /if \(provider === 'airpay'\) return <span className="pill ok"/)
  assert.match(pay, />TEST<\/span>/)
  assert.match(pay, /<GatewayPill provider=\{p\.provider\} \/>/)
  assert.match(pay, /\(!want \|\| p\.provider === want\)/)
})
