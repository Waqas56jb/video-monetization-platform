import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogIn, Menu, Sparkles } from 'lucide-react'
import Logo from '@/components/ui/Logo'
import MobileMenu from './MobileMenu'
import useScrolled from '@/hooks/useScrolled'

const NAV_LINKS = [
  { href: '#trending', label: 'Trending' },
  { href: '#how', label: 'How it Works' },
  { href: '#features', label: 'Features' },
  { href: '#creators', label: 'For Creators' },
  { href: '#stories', label: 'Stories' },
]

/** Landing-page header: transparent at top, frosted glass once scrolled. */
export default function Header() {
  const scrolled = useScrolled(40)
  const [menuOpen, setMenuOpen] = useState(false)
  const navigate = useNavigate()

  return (
    <>
      <header className={scrolled ? 'scrolled' : ''}>
        <div className="container nav">
          <Logo />
          <nav className="nav-links">
            {NAV_LINKS.map((l) => (
              <a key={l.href} href={l.href}>
                {l.label}
              </a>
            ))}
          </nav>
          <div className="nav-cta">
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/login')}>
              <LogIn />
              <span className="btn-label">Log in</span>
            </button>
            <button className="btn btn-gold btn-sm nav-cta-primary" onClick={() => navigate('/signup')}>
              <Sparkles />
              <span className="btn-label">Start Creating</span>
            </button>
            <button className="hamburger" onClick={() => setMenuOpen(true)} aria-label="Open menu">
              <Menu />
            </button>
          </div>
        </div>
      </header>

      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  )
}
