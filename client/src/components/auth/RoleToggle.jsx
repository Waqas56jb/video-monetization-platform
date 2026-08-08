import Icon from '@/components/ui/Icon'

/**
 * Viewer / Creator segmented control.
 * options: [{ value, label, icon }]
 */
export default function RoleToggle({ options, value, onChange }) {
  return (
    <div className="role-toggle" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          className={value === o.value ? 'on' : ''}
          onClick={() => onChange(o.value)}
        >
          <Icon name={o.icon} />
          {o.label}
        </button>
      ))}
    </div>
  )
}
