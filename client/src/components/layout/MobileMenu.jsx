import { useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import useLockBodyScroll from '@/hooks/useLockBodyScroll'

const LINKS = [
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
      {LINKS.map((l) => (
        <a key={l.href} href={l.href} onClick={onClose}>
          {l.label}
        </a>
      ))}
      <button className="btn btn-ghost" onClick={() => goTo('/login')}>
        Log in
      </button>
      <button className="btn btn-gold" onClick={() => goTo('/signup')}>
        Start Creating
      </button>
    </div>
  )
}
