import { Link } from 'react-router-dom'
import { Play } from 'lucide-react'

/**
 * The MTONYO+ wordmark.
 *
 * The "+" is the single brand accent — when the client sends the final logo
 * artwork, swap the <span className="logo-mark"> block for an <img> and the
 * rest of the layout keeps working unchanged.
 */
export default function Logo({ to = '/', className = '', onClick }) {
  return (
    <Link className={`logo ${className}`.trim()} to={to} onClick={onClick} aria-label="MTONYO+ home">
      <span className="logo-mark">
        <Play />
      </span>
      <span className="logo-word">
        MTONYO<span className="logo-plus">+</span>
      </span>
    </Link>
  )
}
