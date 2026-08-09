import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { IMG, LANDING_SHOWCASE } from '@/data/copy'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function decodeImage(src) {
  return new Promise((resolve) => {
    if (!src) return resolve()
    const img = new Image()
    img.decoding = 'async'
    const done = () => resolve()
    img.onload = () => {
      if (typeof img.decode === 'function') {
        img.decode().then(done).catch(done)
      } else {
        done()
      }
    }
    img.onerror = done
    img.src = src
  })
}

/**
 * Brand splash that stays up until the route is actually ready to show.
 *
 * On the landing page we wait for fonts + hero/showcase images so the first
 * scroll never hits empty opacity-0 sections or undecoded Unsplash holes.
 * Other routes keep a short splash so dashboards aren't blocked.
 */
export default function Preloader() {
  const { pathname } = useLocation()
  const [hide, setHide] = useState(false)
  const [gone, setGone] = useState(false)
  const isLanding = pathname === '/'

  useEffect(() => {
    let cancelled = false

    const finish = async () => {
      if (cancelled) return
      // Brief hold so the brand mark is readable, not a one-frame flash.
      await sleep(isLanding ? 320 : 140)
      if (!cancelled) setHide(true)
    }

    const boot = async () => {
      document.body.classList.add('is-booting')
      if (isLanding) document.body.classList.add('landing-booting')

      const fonts =
        document.fonts?.ready?.catch?.(() => {}) || Promise.resolve()

      if (!isLanding) {
        await Promise.race([fonts, sleep(500)])
        await finish()
        return
      }

      const critical = [
        IMG.concert,
        IMG.premiere,
        ...LANDING_SHOWCASE.slice(0, 4).map((v) => v.thumb),
      ].filter(Boolean)

      const unique = [...new Set(critical)]
      const assets = Promise.all([fonts, ...unique.map(decodeImage)])
      // Never trap the visitor forever on a slow CDN — 2.8s hard ceiling.
      await Promise.race([assets, sleep(2800)])
      // Let the browser paint one frame with decoded pixels before we lift.
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
      await finish()
    }

    boot()

    return () => {
      cancelled = true
      document.body.classList.remove('is-booting', 'landing-booting')
    }
  }, [isLanding])

  useEffect(() => {
    if (!hide) return
    document.body.classList.remove('is-booting', 'landing-booting')
    const t = setTimeout(() => setGone(true), 420)
    return () => clearTimeout(t)
  }, [hide])

  if (gone) return null

  return (
    <div id="preloader" className={hide ? 'hide' : ''} aria-hidden={hide}>
      <div className="loader-logo">
        MTONYO<span className="logo-plus">+</span>
      </div>
      <div className="loader-bar">
        <span />
      </div>
    </div>
  )
}
