import { test } from 'node:test'
import assert from 'node:assert/strict'
import { publicWebOrigin } from '../_lib/apiOrigin.js'

// The bare domain 308s to www. A preview whose og:image or og:url is the bare
// domain reaches WhatsApp as a redirect, and WhatsApp then sends a plain link.
test('share previews name the served host, never the redirecting bare domain', () => {
  const prev = process.env.PUBLIC_WEB_URL
  try {
    delete process.env.PUBLIC_WEB_URL
    assert.equal(publicWebOrigin(), 'https://www.mtonyoplus.com', 'default (the client Vercel project sets no env)')
    process.env.PUBLIC_WEB_URL = 'https://mtonyoplus.com/'
    assert.equal(publicWebOrigin(), 'https://www.mtonyoplus.com', 'bare domain in env is corrected')
    process.env.PUBLIC_WEB_URL = 'https://preview.example.app/'
    assert.equal(publicWebOrigin(), 'https://preview.example.app', 'any other host is kept')
  } finally {
    if (prev === undefined) delete process.env.PUBLIC_WEB_URL
    else process.env.PUBLIC_WEB_URL = prev
  }
})
