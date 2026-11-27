import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { viaUrl } from './shareVia.js'
import { classifyVisit } from './trafficSource.js'

test('each share button tags its link, and the tag is read back as that channel', () => {
  const base = 'https://www.mtonyoplus.com/watch/how-to-cook-pilau-properly?s=a1a58b1a0f'
  for (const [via, source] of [['wa', 'whatsapp'], ['fb', 'facebook'], ['ig', 'instagram'], ['tt', 'tiktok']]) {
    const u = new URL(viaUrl(base, via))
    assert.equal(u.searchParams.get('s'), 'a1a58b1a0f', 'card version kept')
    // WhatsApp sends no referrer: the tag alone must name the channel.
    assert.equal(classifyVisit({ search: u.search }).source, source)
  }
  assert.equal(viaUrl('https://www.mtonyoplus.com/watch/x', 'wa'), 'https://www.mtonyoplus.com/watch/x?via=wa')
})

test('the share sheet sends the tagged link to WhatsApp and Facebook', () => {
  const src = readFileSync(new URL('../components/watch/ShareSheet.jsx', import.meta.url), 'utf8')
  assert.match(src, /whatsappHref\(waUrl\)/)
  assert.match(src, /whatsappWebHref\(waUrl\)/)
  assert.match(src, /facebookHref\(fbUrl\)/)
})
