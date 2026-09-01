/**
 * A7's screenshot grid — the artefact the responsiveness pass was supposed to
 * leave behind and did not.
 *
 * The measurements for A7 exist and are in M2-VERIFY.md: 70 page/width
 * combinations, zero horizontal overflow, four small tap targets named. What
 * was missing is the thing a person can actually look at, which is the point of
 * a screenshot — a number says "no overflow", a picture says whether the page
 * looks right.
 *
 * ONE STRIP PER PAGE PER ENGINE, not 140 separate files. Ten widths of one page
 * belong side by side; that is what makes a grid worth having and it keeps the
 * repository from gaining eight megabytes of PNGs nobody opens.
 *
 * Composed with `sharp`, which the server already depends on — no new dependency
 * for a script that runs by hand.
 *
 *   PLAYWRIGHT_MODULE=file:///… node scripts/e2e/screens.mjs
 *   WIDTHS=375,768,1440 PAGES=/,/explore node scripts/e2e/screens.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const pw = await import(process.env.PLAYWRIGHT_MODULE || 'playwright')
const sharp = (await import(process.env.SHARP_MODULE || 'sharp')).default

const BASE = process.env.BASE || 'https://video-monetization-platform-chi.vercel.app'
const OUT = process.env.OUT || 'e2e/screens'
const WIDTHS = (process.env.WIDTHS || '320,375,390,414,768,834,1024,1280,1440,1920')
  .split(',')
  .map(Number)
const PAGES = (process.env.PAGES || '/,/explore,/watch/how-to-cook-pilau-properly,/login,/signup,/creator,/legal/terms')
  .split(',')
const ENGINES = (process.env.ENGINES || 'webkit,chromium').split(',')

/** Height per shot. Tall enough to show the fold, short enough to compose. */
const SHOT_HEIGHT = 900
/** Each shot is scaled to this width in the strip, so a 320 and a 1920 sit level. */
const TILE_WIDTH = Number(process.env.TILE_WIDTH || 260)
/**
 * JPEG, not PNG, and this is not a detail.
 *
 * The first run wrote PNGs: 0.5-1.3 MB per strip, about eleven megabytes for the
 * full grid. That is a lot of repository for screenshots, and screenshots of a
 * dark UI are exactly the case where PNG's lossless promise buys nothing anybody
 * can see. At quality 72 the same strips are a fifth of the size and the
 * difference is invisible on a photograph of a web page.
 */
const JPEG_QUALITY = Number(process.env.JPEG_QUALITY || 72)

const API = 'https://video-monetization-platform-production.up.railway.app'
const list = await (await fetch(`${API}/api/videos?limit=8&sort=trending`)).json()
const creatorId = (list.videos || []).find((v) => v.creator?.id)?.creator?.id
const resolve = (p) => (p === '/creator' ? `/creator/${creatorId}` : p)
const label = (p) => (p === '/' ? 'home' : p.replace(/^\//, '').replace(/[/:]/g, '-'))

await mkdir(OUT, { recursive: true })
const index = []

for (const engine of ENGINES) {
  const browser = await pw[engine].launch()
  for (const page of PAGES) {
    const url = `${BASE}${resolve(page)}`
    const tiles = []
    for (const width of WIDTHS) {
      const ctx = await browser.newContext({
        viewport: { width, height: SHOT_HEIGHT },
        deviceScaleFactor: 1,
        /* Touch on the widths that are phones and tablets, because some of the
           layout differences this grid exists to show are touch-conditional. */
        hasTouch: width <= 1024,
        isMobile: width <= 414,
      })
      const p = await ctx.newPage()
      try {
        await p.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 })
        await p.waitForTimeout(width <= 414 ? 7000 : 5500)
        const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
        const shot = await p.screenshot({ type: 'png' })
        const tile = await sharp(shot).resize({ width: TILE_WIDTH, fit: 'inside' }).toBuffer()
        tiles.push({ width, tile, overflow })
        process.stdout.write(`  ${engine} ${page} @${width}${overflow > 0 ? ` OVERFLOW +${overflow}` : ''}\n`)
      } catch (err) {
        process.stdout.write(`  ${engine} ${page} @${width} FAILED: ${String(err).split('\n')[0].slice(0, 70)}\n`)
      }
      await ctx.close()
    }
    if (!tiles.length) continue

    /* Compose the strip. Each tile keeps its aspect ratio, so a 320 is tall and
       narrow-looking and a 1920 is short and wide — which is the comparison. */
    const metas = await Promise.all(tiles.map((t) => sharp(t.tile).metadata()))
    const gap = 8
    const stripHeight = Math.max(...metas.map((m) => m.height)) + 26
    const stripWidth = tiles.length * (TILE_WIDTH + gap) + gap

    const composites = tiles.map((t, i) => ({
      input: t.tile,
      left: gap + i * (TILE_WIDTH + gap),
      top: 26,
    }))
    /* A caption row, so the strip is readable without the filename. */
    const captions = tiles
      .map((t, i) => {
        const x = gap + i * (TILE_WIDTH + gap) + 4
        const colour = t.overflow > 0 ? '#e11d48' : '#94a3b8'
        return `<text x="${x}" y="18" font-family="monospace" font-size="14" fill="${colour}">${t.width}px${t.overflow > 0 ? ` +${t.overflow}!` : ''}</text>`
      })
      .join('')
    const header = Buffer.from(
      `<svg width="${stripWidth}" height="${stripHeight}"><rect width="100%" height="100%" fill="#0a0a12"/>${captions}</svg>`
    )

    const file = join(OUT, `${engine}-${label(page)}.jpg`)
    await sharp(header).composite(composites).jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toFile(file)
    const bad = tiles.filter((t) => t.overflow > 0)
    index.push({ engine, page, file, widths: tiles.map((t) => t.width), overflow: bad.map((t) => `${t.width}px +${t.overflow}`) })
    console.log(`→ ${file}  (${tiles.length} widths${bad.length ? `, ${bad.length} OVERFLOWING` : ', none overflowing'})`)
  }
  await browser.close()
}

const overflowing = index.flatMap((r) => r.overflow.map((o) => `${r.engine} ${r.page} ${o}`))
await writeFile(
  join(OUT, 'README.md'),
  `# A7 — responsiveness grid\n\n` +
    `Each image is one page at ${WIDTHS.join(', ')} px, left to right, on the engine named in the\n` +
    `filename. The caption above each shot is its width; it turns red and shows the excess if that\n` +
    `combination scrolls sideways.\n\n` +
    `Captured ${new Date().toISOString().slice(0, 10)} against ${BASE}.\n\n` +
    index.map((r) => `- \`${r.file.replace(/\\\\/g, '/')}\` — ${r.page} on ${r.engine}`).join('\n') +
    `\n\n**Horizontal overflow: ${overflowing.length}.**` +
    (overflowing.length ? `\n\n${overflowing.map((o) => `- ${o}`).join('\n')}\n` : ' Not one combination scrolls sideways.\n'),
  'utf8'
)

console.log(`\n${index.length} strips written to ${OUT}`)
console.log(overflowing.length ? `OVERFLOW in ${overflowing.length} combinations:\n  ${overflowing.join('\n  ')}` : 'No horizontal overflow anywhere.')
process.exit(overflowing.length ? 1 : 0)
