import { useEffect, useState } from 'react'

/**
 * The original preloader: shows the animated bar, then fades out ~650ms after
 * `window.load` (or immediately if the page already finished loading).
 */
export default function Preloader() {
  const [hide, setHide] = useState(false)
  const [gone, setGone] = useState(false)

  useEffect(() => {
    let fade
    const start = () => {
      fade = setTimeout(() => setHide(true), 650)
    }
    if (document.readyState === 'complete') start()
    else window.addEventListener('load', start)
    return () => {
      clearTimeout(fade)
      window.removeEventListener('load', start)
    }
  }, [])

  // Remove from the tree once the 0.7s fade-out has finished.
  useEffect(() => {
    if (!hide) return
    const t = setTimeout(() => setGone(true), 800)
    return () => clearTimeout(t)
  }, [hide])

  if (gone) return null

  return (
    <div id="preloader" className={hide ? 'hide' : ''} aria-hidden={hide}>
      <div className="loader-logo">
        Creator<span className="grad-text">TZ</span>
      </div>
      <div className="loader-bar">
        <span />
      </div>
    </div>
  )
}
