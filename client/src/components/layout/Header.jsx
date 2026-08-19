import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Library, LogIn, Menu, Sparkles } from 'lucide-react'
import Logo from '@/components/ui/Logo'
import MobileMenu from './MobileMenu'
import useScrolled from '@/hooks/useScrolled'
import useSectionLink from '@/hooks/useSectionLink'
import { useRole } from '@/context/AuthContext'
import { getAccessToken } from '@/lib/api'

const NAV_LINKS = [
  { to: '/explore', label: 'Explore' },
  { section: 'trending', label: 'Trending' },
  { section: 'how', label: 'How it Works' },
  { section: 'features', label: 'Features' },
  { section: 'creators', label: 'For Creators' },
  { section: 'stories', label: 'Stories' },
]

/** Public header: transparent at top of the homepage, frosted once scrolled. */
export default function Header({ solid = false }) {
  const scrolled = useScrolled(40)
  const [menuOpen, setMenuOpen] = useState(false)
  const navigate = useNavigate()
  const { authed, loading } = useRole()
  /* Token in hand → show library chrome immediately. Waiting for /me used to
     paint Log in, then swap to Dashboard — the header jump on first load. */
  const signedIn = authed || (loading && Boolean(getAccessToken()))
  const goToSection = useSectionLink()

  return (
    <>
      <header className={solid || scrolled ? 'scrolled' : ''}>
        <div className="container nav">
          <Logo />
          <nav className="nav-links">
            {NAV_LINKS.map((l) =>
              l.to ? (
                <Link key={l.to} to={l.to}>
                  {l.label}
                </Link>
              ) : (
                /* Still an anchor, so it can be opened in a new tab and read by
                   a screen reader as a link — but the handler does the work, so
                   it also functions from pages that have no such section. */
                <a
                  key={l.section}
                  href={`/#${l.section}`}
                  onClick={(e) => goToSection(l.section, e)}
                >
                  {l.label}
                </a>
              )
            )}
          </nav>
          <div className="nav-cta">
            {/* A signed-in user must never be shown "Log in" with no route back
                to their own dashboard — that is how they got stranded on
                /explore after opening it from the creator menu. */}
            {signedIn ? (
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
