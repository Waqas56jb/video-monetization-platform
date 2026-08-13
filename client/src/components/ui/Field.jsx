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

/**
 * Same field, with a fixed list instead of free text.
 *
 * A native `<select>` on purpose: a phone renders it as the OS picker, which is
 * easier to use one-handed than any custom dropdown we would write, and it
 * needs no keyboard or focus handling of our own.
 *
 * `options` takes plain strings, or `{ value, label }` when the two differ.
 */
export function SelectField({
  label,
  icon,
  id,
  options = [],
  placeholder,
  className = '',
  ...selectProps
}) {
  return (
    <div className={`field ${className}`.trim()}>
      {label && <label htmlFor={id}>{label}</label>}
      <div className="input-wrap has-select">
        <Icon name={icon} />
        <select id={id} {...selectProps}>
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((o) => {
            const value = typeof o === 'string' ? o : o.value
            const text = typeof o === 'string' ? o : o.label
            return (
              <option key={value} value={value}>
                {text}
              </option>
            )
          })}
        </select>
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
