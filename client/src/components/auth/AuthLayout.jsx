import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, X } from 'lucide-react'
import Logo from '@/components/ui/Logo'

/**
 * Split auth screen: image + pitch on the left (hidden ≤900px), form on the right.
 * Phones get a compact brand strip instead of the marketing panel.
 *
 * side: { image, badge, heading, text }
 * back: { to, label }
 */
export default function AuthLayout({ side, back, title, subtitle, children }) {
  const navigate = useNavigate()

  /**
   * Close always lands somewhere sensible: the previous page if the user
   * arrived from inside the app, otherwise the homepage. An auth screen must
   * never be a dead end, even when opened straight from a shared link.
   */
  const close = () => {
    if (window.history.length > 1) navigate(-1)
    else navigate('/')
  }

  return (
    <div className="page">
      <div className="auth-wrap">
        <div className="auth-side">
          <div className="auth-side-content">
            <span className="badge">{side.badge}</span>
            <h2 style={{ marginTop: 18 }}>{side.heading}</h2>
            <p>{side.text}</p>
          </div>
        </div>

        <div className="auth-form-wrap">
          <button className="auth-close" onClick={close} aria-label="Close and go back">
            <X />
          </button>

          <div className="auth-card">
            <div className="auth-mobile-brand">
              <Logo size="full" />
              <span className="badge">{side.badge}</span>
            </div>
            <Link className="back" to={back.to}>
              <ArrowLeft />
              {back.label}
            </Link>
            <h1>{title}</h1>
            <p>{subtitle}</p>
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
