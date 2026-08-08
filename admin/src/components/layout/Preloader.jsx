import { useEffect, useState } from 'react'

/** Fades out ~650ms after window.load, exactly like the original. */
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

    // `load` waits on remote artwork and can hang on a slow connection; the
    // splash is decoration, so it always clears within this ceiling.
    const ceiling = setTimeout(() => setHide(true), 1600)

    return () => {
      clearTimeout(fade)
      clearTimeout(ceiling)
      window.removeEventListener('load', start)
    }
  }, [])

  useEffect(() => {
    if (!hide) return
    const t = setTimeout(() => setGone(true), 800)
    return () => clearTimeout(t)
  }, [hide])

  if (gone) return null

  return (
    <div id="preloader" className={hide ? 'hide' : ''} aria-hidden={hide}>
      <div className="loader-logo">
        Mtonyo<span className="logo-plus">+</span>{' '}
        <span style={{ fontSize: 15, color: 'var(--gold)' }}>ADMIN</span>
      </div>
      <div className="loader-bar">
        <span />
      </div>
    </div>
  )
}
