import { useEffect, useState } from 'react'
import { IMG, LANDING_SHOWCASE } from '@/data/copy'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function decodeImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve()
    const img = new Image()
    img.decoding = 'async'
    const done = () => resolve()
    img.onload = () => {
      if (typeof img.decode === 'function') img.decode().then(done).catch(done)
      else done()
    }
    img.onerror = done
    img.src = src
  })
}

/**
 * Landing stays on a boot screen until fonts + hero/showcase images are ready
 * (or a short ceiling hits). The page is not mounted half-painted.
 */
export default function useLandingReady() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      const fonts = document.fonts?.ready?.catch?.(() => {}) || Promise.resolve()
      const urls = [
        IMG.concert,
        IMG.premiere,
        ...LANDING_SHOWCASE.map((v) => v.thumb),
      ].filter(Boolean)
      const unique = [...new Set(urls)]

      await Promise.race([
        Promise.all([fonts, ...unique.map(decodeImage)]),
        sleep(2200),
      ])

      // One paint with decoded bitmaps in cache before we reveal the page.
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      await sleep(180)

      if (!cancelled) setReady(true)
    }

    run()
    return () => {
      cancelled = true
    }
  }, [])

  return ready
}
