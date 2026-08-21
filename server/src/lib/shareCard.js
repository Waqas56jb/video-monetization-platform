import { readFileSync } from 'node:fs'
import opentype from 'opentype.js'
import sharp from 'sharp'
import { log } from './logger.js'

const W = 1200
const H = 630
const PAD = 52
const GOLD = '#f5c518'
const WHITE = '#ffffff'
const MUTED = '#e8e4d8'
const DARK = '#1a1200'
const CTA = 'WATCH FREE PREVIEW'
const BRAND = 'MTONYO+'

const FONT_URL = new URL('../assets/fonts/Inter-Bold.ttf', import.meta.url)

let font = null

function loadFont() {
  if (font) return font
  const buf = readFileSync(FONT_URL)
  font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
  return font
}

function advanceOf(text, size) {
  const f = loadFont()
  const scale = size / f.unitsPerEm
  let w = 0
  for (const ch of String(text)) {
    w += (f.charToGlyph(ch).advanceWidth || 0) * scale
  }
  return w
}

function fitEllipsis(text, size, maxWidth) {
  const raw = String(text || '').trim()
  if (!raw) return ''
  if (advanceOf(raw, size) <= maxWidth) return raw
  const ell = advanceOf('…', size) > 0 ? '…' : '...'
  let t = raw
  while (t.length > 1 && advanceOf(t + ell, size) > maxWidth) t = t.slice(0, -1)
  return t + ell
}

function wrapLines(text, size, maxWidth, maxLines) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean)
  if (!words.length) return []
  const lines = []
  let current = ''
  for (let i = 0; i < words.length; i++) {
    const next = current ? `${current} ${words[i]}` : words[i]
    if (!current || advanceOf(next, size) <= maxWidth) {
      current = next
      continue
    }
    lines.push(current)
    current = words[i]
    if (lines.length >= maxLines - 1) {
      lines.push(fitEllipsis(words.slice(i).join(' '), size, maxWidth))
      return lines
    }
  }
  if (current) lines.push(fitEllipsis(current, size, maxWidth))
  return lines.slice(0, maxLines)
}

function textPaths(text, x, y, size, fill) {
  const f = loadFont()
  const scale = size / f.unitsPerEm
  let cursor = x
  const parts = []
  for (const ch of String(text)) {
    const g = f.charToGlyph(ch)
    const p = g.getPath(cursor, y, size)
    const d = p.toPathData ? p.toPathData(2) : null
    const svg = p.toSVG(2)
    if (d) parts.push(`<path fill="${fill}" d="${d}"/>`)
    else if (svg) parts.push(svg.replace('<path', `<path fill="${fill}"`))
    cursor += (g.advanceWidth || 0) * scale
  }
  return parts.join('')
}

/**
 * Sizes are set for how small this actually arrives.
 *
 * The canvas is 1200 wide, but WhatsApp renders the card at roughly a
 * quarter of that on a phone. Everything here divides by four before anyone
 * reads it, which is why the creator's name at 24 was reported as too hard to
 * see: about six pixels tall by the time it reached the screen, in grey, over
 * whatever the film frame happened to be doing behind it.
 *
 * So the name is larger than the old title was, it is white rather than
 * muted, and the whole block sits on a scrim dark enough that a bright frame
 * cannot swallow it.
 */
const TITLE_SIZE = 56
const CREATOR_SIZE = 36
const CTA_SIZE = 22
const BRAND_SIZE = 34
const LINE_STEP = 64

function overlaySvg({ title, creator }) {
  const maxText = W - PAD * 2
  const titleLines = wrapLines(title, TITLE_SIZE, maxText, 2)
  const creatorLine = creator ? fitEllipsis(creator, CREATOR_SIZE, maxText) : ''
  const ctaW = Math.ceil(advanceOf(CTA, CTA_SIZE) + 44)
  const ctaH = 52
  const ctaY = H - PAD - ctaH
  const ctaTextY = ctaY + 34
  /**
   * Baseline gaps, not eyeballed padding.
   *
   * These are baselines, so the space between two lines has to clear the
   * descenders of the one above and the cap height of the one below. 26 did
   * not: at the size a phone renders this, a two-line title had its second
   * line touching the creator's name -- "…11.50.34 PM" sitting on top of
   * "Yasmin Chali". Only visible once the card was viewed at 340px rather
   * than full size, which is how it reaches anybody.
   */
  const creatorY = creatorLine ? ctaY - 30 : ctaY - 14
  const titleBottom = creatorLine ? creatorY - 46 : creatorY
  const titleStart = titleBottom - (titleLines.length - 1) * LINE_STEP

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="topFade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#05050a" stop-opacity="0.72"/>
      <stop offset="1" stop-color="#05050a" stop-opacity="0"/>
    </linearGradient>
    <!-- Deeper and starting higher than before: the name used to land on a
         bright part of the frame and disappear into it. -->
    <linearGradient id="botFade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#05050a" stop-opacity="0"/>
      <stop offset="0.30" stop-color="#05050a" stop-opacity="0.62"/>
      <stop offset="0.62" stop-color="#05050a" stop-opacity="0.88"/>
      <stop offset="1" stop-color="#05050a" stop-opacity="0.97"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="200" fill="url(#topFade)"/>
  <rect y="250" width="${W}" height="380" fill="url(#botFade)"/>
  <circle cx="600" cy="236" r="54" fill="rgba(5,5,10,0.55)" stroke="${GOLD}" stroke-width="3"/>
  <polygon points="586,212 586,260 628,236" fill="${WHITE}"/>
  ${textPaths(BRAND, PAD, 82, BRAND_SIZE, GOLD)}
  ${titleLines.map((line, i) => textPaths(line, PAD, titleStart + i * LINE_STEP, TITLE_SIZE, WHITE)).join('')}
  ${creatorLine ? textPaths(creatorLine, PAD, creatorY, CREATOR_SIZE, WHITE) : ''}
  <rect x="${PAD}" y="${ctaY}" rx="11" ry="11" width="${ctaW}" height="${ctaH}" fill="${GOLD}"/>
  ${textPaths(CTA, PAD + 22, ctaTextY, CTA_SIZE, DARK)}
</svg>`
}

/**
 * Burn the sell layer onto the film frame: MTONYO+, title, creator,
 * a play cue and WATCH FREE PREVIEW. WhatsApp often drops OG text, so
 * the JPEG itself has to make someone want to tap.
 *
 * Falls back to a plain 1200×630 JPEG if compositing fails — a poster
 * still beats a missing card.
 */
export async function brandShareCard(posterBuf, { title, creator } = {}) {
  const plain = () =>
    sharp(posterBuf)
      .rotate()
      .resize(W, H, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: 74, mozjpeg: true })
      .toBuffer()

  try {
    loadFont()
    const overlay = Buffer.from(overlaySvg({ title, creator }))
    let out = await sharp(posterBuf)
      .rotate()
      .resize(W, H, { fit: 'cover', position: 'centre' })
      .composite([{ input: overlay, top: 0, left: 0 }])
      .jpeg({ quality: 74, mozjpeg: true })
      .toBuffer()
    if (out.length > 240_000) {
      out = await sharp(out).jpeg({ quality: 68, mozjpeg: true }).toBuffer()
    }
    return out
  } catch (err) {
    log.warn('share card brand failed, sending plain poster:', err.message)
    try {
      return await plain()
    } catch {
      return posterBuf
    }
  }
}
