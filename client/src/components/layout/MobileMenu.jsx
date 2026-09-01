import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import useLockBodyScroll from '@/hooks/useLockBodyScroll'
import useSectionLink from '@/hooks/useSectionLink'
import { useRole } from '@/context/AuthContext'
import { getAccessToken } from '@/lib/api'
import { loginHref } from '@/lib/loginReturn'

const LINKS = [
  { to: '/explore', label: 'Explore' },
  { section: 'trending', label: 'Trending' },
  { section: 'how', label: 'How it Works' },
  { section: 'features', label: 'Features' },
  { section: 'creators', label: 'For Creators' },
  // Was missing here while the desktop header offered it, so the same menu
  // showed different things depending on the size of the screen.
  { section: 'stories', label: 'Stories' },
]

/** Full-screen mobile navigation overlay. */
export default function MobileMenu({ open, onClose }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { authed, loading } = useRole()
  const signedIn = authed || (loading && Boolean(getAccessToken()))
  const goToSection = useSectionLink()
  useLockBodyScroll(open)

  // Escape must always get you out of a full-screen overlay.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const goTo = (path) => {
    onClose()
    navigate(path)
  }

  // Must portal to <body>: `.page { transform }` turns position:fixed into a
  // page-sized box, so flex-centered links sit miles below the viewport and
  // the menu looks blank (only the absolute close button stays in view).
  return createPortal(
    <div
      className={`mobile-menu ${open ? 'open' : ''}`.trim()}
      aria-hidden={!open}
      role="dialog"
      aria-modal={open ? 'true' : undefined}
      aria-label="Menu"
    >
      <button className="close-m" onClick={onClose} aria-label="Close menu">
        <X />
      </button>
      <nav className="mobile-menu-nav">
        {LINKS.map((l) =>
          l.to ? (
            <button key={l.to} type="button" className="mm-link" onClick={() => goTo(l.to)}>
              {l.label}
            </button>
          ) : (
            <a
              key={l.section}
              href={`/#${l.section}`}
              className="mm-link"
              onClick={(e) => {
                onClose()
                goToSection(l.section, e)
              }}
            >
              {l.label}
            </a>
          )
        )}
      </nav>
      <div className="mobile-menu-actions">
        {signedIn ? (
          <>
            <button type="button" className="btn btn-ghost btn-block" onClick={() => goTo('/dashboard')}>
              My Library
            </button>
            <button type="button" className="btn btn-gold btn-block" onClick={() => goTo('/dashboard')}>
              Go to Dashboard
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-ghost btn-block" onClick={() => goTo(loginHref(location))}>
              Log in
            </button>
            <button type="button" className="btn btn-gold btn-block" onClick={() => goTo('/signup?side=creator')}>
              Start Creating
            </button>
          </>
        )}
      </div>
    </div>,
    document.body
  )
}
