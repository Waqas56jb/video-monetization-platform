import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'

/** After the first route has painted, in-app clicks must not flash a black screen. */
let appBooted = false

/**
 * Short brand splash for non-landing routes.
 * Landing mounts immediately with its own brief overlay — never waits on assets.
 */
export default function Preloader() {
  const { pathname } = useLocation()
  const [hide, setHide] = useState(false)
  const [gone, setGone] = useState(() => pathname === '/' || appBooted)
  const skip = pathname === '/' || appBooted

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
