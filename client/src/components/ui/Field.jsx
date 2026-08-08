import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import Icon from './Icon'

/** Labelled input with a leading icon — the `.field > .input-wrap` pattern. */
export default function Field({ label, icon, id, className = '', ...inputProps }) {
  return (
    <div className={`field ${className}`.trim()}>
      {label && <label htmlFor={id}>{label}</label>}
      <div className="input-wrap">
        <Icon name={icon} />
        <input id={id} {...inputProps} />
      </div>
    </div>
  )
}

/** Same field, plus the eye button that toggles password visibility. */
export function PasswordField({ label, icon = 'lock', id, className = '', ...inputProps }) {
  const [visible, setVisible] = useState(false)

  return (
    <div className={`field ${className}`.trim()}>
      {label && <label htmlFor={id}>{label}</label>}
      <div className="input-wrap">
        <Icon name={icon} />
        <input id={id} type={visible ? 'text' : 'password'} {...inputProps} />
        <button
          type="button"
          className="eye"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
        >
          {visible ? <EyeOff /> : <Eye />}
        </button>
      </div>
    </div>
  )
}
