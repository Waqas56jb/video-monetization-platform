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
      clearTimeout(fade)
      fade = setTimeout(() => setHide(true), 350)
    }

    if (document.readyState === 'complete') start()
    else window.addEventListener('load', start)

    /**
     * `load` waits for every image on the page, including remote artwork. On a
     * slow connection that can take many seconds — or never fire at all if a
     * request hangs — which left users staring at the splash screen and having
     * to reopen the link. The splash is decoration, so it gets a hard ceiling:
     * after this it goes away regardless of what is still downloading.
     */
    const ceiling = setTimeout(() => setHide(true), 1600)

    return () => {
      clearTimeout(fade)
      clearTimeout(ceiling)
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
        MTONYO<span className="logo-plus">+</span>
      </div>
      <div className="loader-bar">
        <span />
      </div>
    </div>
  )
}
