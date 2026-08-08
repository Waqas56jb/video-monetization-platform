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
