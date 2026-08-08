import { Link } from 'react-router-dom'
import { Play } from 'lucide-react'

/** The `Creator TZ` wordmark + glowing play badge. */
export default function Logo({ to = '/', className = '', onClick }) {
  return (
    <Link className={`logo ${className}`.trim()} to={to} onClick={onClick} aria-label="CreatorTZ home">
      <span className="logo-mark">
        <Play />
      </span>
      Creator<span className="grad-purple">TZ</span>
    </Link>
  )
}
