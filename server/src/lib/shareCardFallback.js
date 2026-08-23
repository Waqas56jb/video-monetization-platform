import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ASSET_DIR = join(dirname(fileURLToPath(import.meta.url)), '../assets')
const FALLBACK_PATH = join(ASSET_DIR, 'share-card-fallback.jpg')

let cached = null

/** Branded 1200×630 JPEG used when share_card_cache has no row yet. */
export async function getFallbackShareCard() {
  if (cached) return cached
  if (existsSync(FALLBACK_PATH)) {
    cached = readFileSync(FALLBACK_PATH)
    return cached
  }
  cached = await generateFallbackShareCard()
  try {
    mkdirSync(ASSET_DIR, { recursive: true })
    writeFileSync(FALLBACK_PATH, cached)
  } catch {
    /* cold start without write access is fine */
  }
  return cached
}

export async function generateFallbackShareCard() {
  const svg = `<svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#1a0a3a"/>
        <stop offset="100%" stop-color="#06060a"/>
      </linearGradient>
    </defs>
    <rect width="1200" height="630" fill="url(#bg)"/>
    <text x="52" y="90" fill="#f5c518" font-family="Arial,sans-serif" font-size="34" font-weight="700">MTONYO+</text>
    <circle cx="600" cy="280" r="54" fill="rgba(5,5,10,0.55)" stroke="#f5c518" stroke-width="3"/>
    <polygon points="586,256 586,304 628,280" fill="#ffffff"/>
    <text x="52" y="520" fill="#ffffff" font-family="Arial,sans-serif" font-size="48" font-weight="700">Watch free preview</text>
    <text x="52" y="570" fill="#e8e4d8" font-family="Arial,sans-serif" font-size="28">Tanzania&apos;s premium creator video platform</text>
  </svg>`
  let buf = await sharp(Buffer.from(svg))
    .jpeg({ quality: 78, mozjpeg: true, progressive: false, chromaSubsampling: '4:2:0' })
    .toBuffer()
  if (buf.length > 150_000) {
    buf = await sharp(buf).jpeg({ quality: 68, mozjpeg: true }).toBuffer()
  }
  return buf
}
