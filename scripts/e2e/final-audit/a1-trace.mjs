// Free+ads opened from an Explore card: DOM ad state + every iframe + ads/playback API calls, 20s.
const pw = await import(process.env.PLAYWRIGHT_MODULE)
const { chromium } = pw
const BASE = process.env.BASE
const SLUG = process.env.SLUG || 'ugali-samaki-sunday-cooking'
const FROM = process.env.FROM || 'explore' // explore | direct
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
let t0 = Date.now()
page.on('response', (r) => {
  const u = r.url()
  if (/\/api\/(ads|playback|videos)\//.test(u)) console.log(`  ${String(Date.now() - t0).padStart(6)}ms NET ${r.status()} ${u.replace(/^https:\/\/[^/]+/, '').slice(0, 90)}`)
})
if (FROM === 'explore') {
  await page.goto(`${BASE}/explore`, { waitUntil: 'domcontentloaded' })
  const card = page.locator(`a[href$="/watch/${SLUG}"]`).first()
  await card.waitFor({ state: 'attached', timeout: 60000 })
  await page.waitForTimeout(1500)
  console.log('--- click')
  t0 = Date.now()
  await card.click()
} else {
  t0 = Date.now()
  await page.goto(`${BASE}/watch/${SLUG}`, { waitUntil: 'domcontentloaded' })
}
let last = ''
while (Date.now() - t0 < 20000) {
  const dom = await page.evaluate(() => {
    const st = document.querySelector('.ad-stage')
    return `adStage=${st ? st.dataset.adState : 'none'} skip=${document.querySelector('.ad-skip')?.innerText?.trim() || '-'} layer=${!!document.querySelector('.player-ad-layer')}`
  }).catch(() => 'x')
  const frames = []
  for (const el of await page.$$('iframe')) {
    const role = await el.evaluate((e) => (e.closest('.ad-stage') ? 'AD' : e.closest('.stream-shell') ? 'FILM' : 'other')).catch(() => '?')
    const src = await el.getAttribute('src').catch(() => '')
    const f = await el.contentFrame().catch(() => null)
    const s = f ? await f.evaluate(() => { const v = document.querySelector('video'); return v ? `${v.currentTime.toFixed(1)}${v.paused ? 'p' : '▶'}` : 'novideo' }).catch(() => 'x') : 'noframe'
    if (role !== 'other') frames.push(`${role}[${(src || '').slice(-12)}]=${s}`)
  }
  const sig = `${dom} | ${frames.join(' ')}`
  if (sig.replace(/\d+\.\d/g, 'n') !== last.replace(/\d+\.\d/g, 'n')) console.log(`  ${String(Date.now() - t0).padStart(6)}ms ${sig}`)
  last = sig
  await page.waitForTimeout(120)
}
console.log(`  final: ${last}`)
await browser.close()
