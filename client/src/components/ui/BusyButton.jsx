import { Loader2 } from 'lucide-react'

/**
 * Button that shows an inline spinner synchronously when `busy` is true.
 * Use in click handlers: set busy before any await/fetch.
 */
export default function BusyButton({
  busy = false,
  icon: Icon,
  children,
  className = '',
  type = 'button',
  ...rest
}) {
  return (
    <button
      type={type}
      className={className}
      aria-busy={busy || undefined}
      disabled={busy || rest.disabled}
      {...rest}
    >
      {busy ? <Loader2 size={14} className="ui-spin" aria-hidden="true" /> : Icon ? <Icon size={14} /> : null}
      {children}
    </button>
  )
}
