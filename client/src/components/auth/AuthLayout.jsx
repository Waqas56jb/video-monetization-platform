import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

/**
 * Split auth screen: image + pitch on the left (hidden ≤900px), form on the right.
 *
 * side: { image, badge, heading, text }
 * back: { to, label }
 */
export default function AuthLayout({ side, back, title, subtitle, children }) {
  return (
    <div className="page">
      <div className="auth-wrap">
        <div className="auth-side">
          <img src={side.image} alt="" />
          <div className="auth-side-content">
            <span className="badge">{side.badge}</span>
            <h2 style={{ marginTop: 18 }}>{side.heading}</h2>
            <p>{side.text}</p>
          </div>
        </div>

        <div className="auth-form-wrap">
          <div className="auth-card">
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
