import { useEffect, useState } from 'react'

/**
 * Brief brand splash. Kept short on purpose — waiting on window.load (every
 * image) made first paint feel broken on mobile data.
 */
export default function Preloader() {
  const [hide, setHide] = useState(false)
  const [gone, setGone] = useState(false)

  useEffect(() => {
    let fade
    const start = () => {
      clearTimeout(fade)
      fade = setTimeout(() => setHide(true), 120)
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      start()
    } else {
      document.addEventListener('DOMContentLoaded', start, { once: true })
      window.addEventListener('load', start, { once: true })
    }

    // Hard ceiling — never block the app for long.
    const ceiling = setTimeout(() => setHide(true), 700)

    return () => {
      clearTimeout(fade)
      clearTimeout(ceiling)
      document.removeEventListener('DOMContentLoaded', start)
      window.removeEventListener('load', start)
    }
  }, [])

  useEffect(() => {
    if (!hide) return
    const t = setTimeout(() => setGone(true), 400)
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
