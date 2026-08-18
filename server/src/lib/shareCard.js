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

function overlaySvg({ title, creator }) {
  const maxText = W - PAD * 2
  const titleLines = wrapLines(title, 44, maxText, 2)
  const creatorLine = creator ? fitEllipsis(creator, 24, maxText) : ''
  const ctaW = Math.ceil(advanceOf(CTA, 18) + 36)
  const ctaH = 42
  const ctaY = H - PAD - ctaH
  const ctaTextY = ctaY + 28
  const creatorY = creatorLine ? ctaY - 22 : ctaY - 10
  const titleBottom = creatorLine ? creatorY - 18 : creatorY
  const titleStart = titleBottom - (titleLines.length - 1) * 52

  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="topFade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#05050a" stop-opacity="0.72"/>
      <stop offset="1" stop-color="#05050a" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="botFade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#05050a" stop-opacity="0"/>
      <stop offset="0.35" stop-color="#05050a" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#05050a" stop-opacity="0.92"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="200" fill="url(#topFade)"/>
  <rect y="300" width="${W}" height="330" fill="url(#botFade)"/>
  <circle cx="600" cy="236" r="54" fill="rgba(5,5,10,0.55)" stroke="${GOLD}" stroke-width="3"/>
  <polygon points="586,212 586,260 628,236" fill="${WHITE}"/>
  ${textPaths(BRAND, PAD, 78, 30, GOLD)}
  ${titleLines.map((line, i) => textPaths(line, PAD, titleStart + i * 52, 44, WHITE)).join('')}
  ${creatorLine ? textPaths(creatorLine, PAD, creatorY, 24, MUTED) : ''}
  <rect x="${PAD}" y="${ctaY}" rx="9" ry="9" width="${ctaW}" height="${ctaH}" fill="${GOLD}"/>
  ${textPaths(CTA, PAD + 18, ctaTextY, 18, DARK)}
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
    if (out.length > 110_000) {
      out = await sharp(out).jpeg({ quality: 60, mozjpeg: true }).toBuffer()
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
