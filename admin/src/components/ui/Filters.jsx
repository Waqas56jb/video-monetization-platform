import { Download, Search } from 'lucide-react'
import { useToast } from '@/context/ToastContext'
import { TOASTS } from '@/data/adminData'

/** Icon + input search box (topbar and inside panel headers). */
export function SearchBar({ value, onChange, placeholder, ariaLabel }) {
  return (
    <div className="searchbar">
      <Search />
      <input
        type="text"
        placeholder={placeholder}
        aria-label={ariaLabel || placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

/** Styled native <select> with the ▾ affordance. */
export function FilterSelect({ value, onChange, options, allLabel, ariaLabel }) {
  return (
    <div className="fselect">
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={ariaLabel || allLabel}>
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  )
}

/** "Export" / "Export CSV" button — surfaces the same toast as the original. */
export function ExportButton({ label = 'Export' }) {
  const showToast = useToast()
  return (
    <button className="btn btn-ghost btn-sm" onClick={() => showToast(TOASTS.exportCsv)}>
      <Download />
      {label}
    </button>
  )
}

/** The filter row that sits inside a panel head. */
export function FilterRow({ children }) {
  return (
    <div className="filters" style={{ margin: 0 }}>
      {children}
    </div>
  )
}
