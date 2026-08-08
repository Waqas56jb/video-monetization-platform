import { Download, Search } from 'lucide-react'

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

/**
 * Download the rows currently on screen as a CSV.
 *
 * This used to pop a toast saying an export had started, and then not export
 * anything. It now actually builds the file from whatever is passed in, so the
 * button does what it says.
 */
export function ExportButton({ label = 'Export', rows = [], filename = 'export.csv' }) {
  const disabled = !rows.length

  const download = () => {
    const keys = [...new Set(rows.flatMap((r) => Object.keys(r)))]
    const NEWLINE = String.fromCharCode(10)
    const needsQuoting = new RegExp('[",' + NEWLINE + ']')
    const escape = (v) => {
      const s = v == null ? '' : String(v)
      return needsQuoting.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
    }
    const csv = [
      keys.join(','),
      ...rows.map((r) => keys.map((k) => escape(r[k])).join(',')),
    ].join(NEWLINE)

    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <button className="btn btn-ghost btn-sm" onClick={download} disabled={disabled} title={disabled ? 'Nothing to export' : label}>
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
