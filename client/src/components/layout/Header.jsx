import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Library, LogIn, Menu, Sparkles } from 'lucide-react'
import Logo from '@/components/ui/Logo'
import MobileMenu from './MobileMenu'
import useScrolled from '@/hooks/useScrolled'
import { useRole } from '@/context/AuthContext'

const NAV_LINKS = [
  { to: '/explore', label: 'Explore' },
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
  const { authed } = useRole()

  return (
    <>
      <header className={scrolled ? 'scrolled' : ''}>
        <div className="container nav">
          <Logo />
          <nav className="nav-links">
            {NAV_LINKS.map((l) =>
              l.to ? (
                <Link key={l.to} to={l.to}>
                  {l.label}
                </Link>
              ) : (
                <a key={l.href} href={l.href}>
                  {l.label}
                </a>
              )
            )}
          </nav>
          <div className="nav-cta">
            {/* A signed-in user must never be shown "Log in" with no route back
                to their own dashboard — that is how they got stranded on
                /explore after opening it from the creator menu. */}
            {authed ? (
              <>
                <button
                  className="btn btn-ghost btn-sm nav-cta-login"
                  onClick={() => navigate('/dashboard')}
                >
                  <Library size={18} />
                  <span className="btn-label">My Library</span>
                </button>
                <button
                  className="btn btn-gold btn-sm nav-cta-primary"
                  onClick={() => navigate('/dashboard')}
                >
                  <LayoutDashboard size={18} />
                  <span className="btn-label-full">Dashboard</span>
                  <span className="btn-label-short">Dash</span>
                </button>
              </>
            ) : (
              <>
                <button
                  className="btn btn-ghost btn-sm nav-cta-login"
                  onClick={() => navigate('/login')}
                >
                  <LogIn size={18} />
                  <span className="btn-label">Log in</span>
                </button>
                <button
                  className="btn btn-gold btn-sm nav-cta-primary"
                  onClick={() => navigate('/signup')}
                >
                  <Sparkles size={18} />
                  <span className="btn-label-full">Start Creating</span>
                  <span className="btn-label-short">Create</span>
                </button>
              </>
            )}
            <button
              className="hamburger"
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={22} />
            </button>
          </div>
        </div>
      </header>

      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  )
}
