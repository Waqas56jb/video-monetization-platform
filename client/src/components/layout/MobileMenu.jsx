import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import useLockBodyScroll from '@/hooks/useLockBodyScroll'

const LINKS = [
  { to: '/explore', label: 'Explore' },
  { href: '#trending', label: 'Trending' },
  { href: '#how', label: 'How it Works' },
  { href: '#features', label: 'Features' },
  { href: '#creators', label: 'For Creators' },
]

/** Full-screen mobile navigation overlay. */
export default function MobileMenu({ open, onClose }) {
  const navigate = useNavigate()
  useLockBodyScroll(open)

  const goTo = (path) => {
    onClose()
    navigate(path)
  }

  return (
    <div className={`mobile-menu ${open ? 'open' : ''}`.trim()} aria-hidden={!open}>
      <button className="close-m" onClick={onClose} aria-label="Close menu">
        <X />
      </button>
      {LINKS.map((l) =>
        l.to ? (
          <button key={l.to} className="mm-link" onClick={() => goTo(l.to)}>
            {l.label}
          </button>
        ) : (
          <a key={l.href} href={l.href} onClick={onClose}>
            {l.label}
          </a>
        )
      )}
      <div className="mobile-menu-actions">
        <button className="btn btn-ghost btn-block" onClick={() => goTo('/login')}>
          Log in
        </button>
        <button className="btn btn-gold btn-block" onClick={() => goTo('/signup')}>
          Start Creating
        </button>
      </div>
    </div>
  )
}
