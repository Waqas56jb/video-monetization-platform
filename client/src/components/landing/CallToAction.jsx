import { useNavigate } from 'react-router-dom'
import { LogIn, Sparkles } from 'lucide-react'

export default function CallToAction() {
  const navigate = useNavigate()

  return (
    <section className="section">
      <div className="container">
        <div className="cta-wrap">
          <span className="badge">
            <span className="dot" />
            TANZANIA&apos;S CREATOR PLATFORM
          </span>
          <h2 style={{ marginTop: 20 }}>
            You Created It.
            <br />
            <span className="grad-text">Now Let It Earn.</span>
          </h2>
          <p>Join Tanzanian creators earning directly from their audiences on MTONYO+.</p>
          <div className="cta-actions">
            <button className="btn btn-gold" onClick={() => navigate('/signup')}>
              <Sparkles />
              Start Earning Today
            </button>
            <button className="btn btn-ghost" onClick={() => navigate('/login')}>
              <LogIn />
              I Have an Account
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}