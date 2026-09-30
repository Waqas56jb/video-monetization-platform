import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'

/** After the first route has painted, in-app clicks must not flash a black screen. */
let appBooted = false

/**
 * Short brand splash for non-landing routes.
 * Landing mounts immediately with its own brief overlay — never waits on assets.
 */
/**
 * A watch page already paints its own loading state in the first HTML — the
 * player box with the film's poster and the MTONYO+ ring (api/watch.js). The
 * splash covered that for ~1.2 s and then uncovered it again: poster → black
 * splash → poster, on every shared link (measured 2026-09-30, all six films).
 */
const OWN_LOADER = /^\/(watch|s)(\/|$)/

export default function Preloader() {
  const { pathname } = useLocation()
  const [hide, setHide] = useState(false)
  const skip = pathname === '/' || appBooted || OWN_LOADER.test(pathname)
  const [gone, setGone] = useState(() => skip)

  useEffect(() => {
    if (skip) {
      appBooted = true
      setGone(true)
      return
    }

    let fade
    const start = () => {
      clearTimeout(fade)
      fade = setTimeout(() => setHide(true), 160)
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      start()
    } else {
      document.addEventListener('DOMContentLoaded', start, { once: true })
      window.addEventListener('load', start, { once: true })
    }

    const ceiling = setTimeout(() => setHide(true), 600)

    return () => {
      clearTimeout(fade)
      clearTimeout(ceiling)
      document.removeEventListener('DOMContentLoaded', start)
      window.removeEventListener('load', start)
    }
  }, [skip])

  useEffect(() => {
    if (!hide) return
    appBooted = true
    const t = setTimeout(() => setGone(true), 380)
    return () => clearTimeout(t)
  }, [hide])

  if (skip || gone) return null

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
