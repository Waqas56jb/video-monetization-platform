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
            JOIN 12,450+ USERS
          </span>
          <h2 style={{ marginTop: 20 }}>
            One Upload. Everywhere.
            <br />
            <span className="grad-text">Real Value.</span>
          </h2>
          <p>
            Whether you create or watch — this is where Tanzanian content gets the value it
            deserves. Free to join. Paid in minutes.
          </p>
          <div className="cta-actions">
            <button className="btn btn-gold" onClick={() => navigate('/signup')}>
              <Sparkles />
              Create Free Account
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