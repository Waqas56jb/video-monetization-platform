import { useLayoutEffect, useRef } from 'react'
import Icon from './Icon'

/** Apply thead labels onto each body cell so CSS can render stacked cards on phones. */
function applyCardLabels(table) {
  if (!table) return
  const labels = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim())
  table.querySelectorAll('tbody tr').forEach((tr) => {
    if (tr.classList.contains('empty-row')) return
    ;[...tr.children].forEach((td, i) => {
      if (labels[i]) td.setAttribute('data-label', labels[i])
    })
  })
}

/** Horizontally scrollable on tablet; stacked cards on phones. */
export function TableWrap({ children, minWidth }) {
  const ref = useRef(null)

  useLayoutEffect(() => {
    applyCardLabels(ref.current)
  })

  return (
    <div className="tbl-wrap tbl-cards">
      <table
        ref={ref}
        className="tbl"
        style={minWidth !== undefined ? { minWidth } : undefined}
      >
        {children}
      </table>
    </div>
  )
}

/** Shown when a search/filter leaves the table empty. */
export function EmptyRow({ colSpan, children = 'No matching records.' }) {
  return (
    <tr className="empty-row">
      <td colSpan={colSpan}>{children}</td>
    </tr>
  )
}

/** Initials, for the many real accounts that have no picture. */
export const initialsOf = (name = '') =>
  String(name)
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0].toUpperCase())
    .join('') || '?'

/**
 * Avatar + name + sub-line cell used by the user/creator tables.
 *
 * Real people mostly have not uploaded a picture, so an <img> with no src
 * would render as a broken-image icon on every row. Initials instead.
 */
export function UserCell({ avatar, name, sub }) {
  return (
    <div className="u-cell">
      {avatar ? (
        <img src={avatar} alt="" loading="lazy" />
      ) : (
        <span className="u-initials">{initialsOf(name)}</span>
      )}
      <div>
        <b>{name}</b>
        {sub && <small>{sub}</small>}
      </div>
    </div>
  )
}

/** Thumbnail + title (+ optional meta) cell used by the video tables. */
export function VideoCell({ thumb, title, meta }) {
  return (
    <div className="v-cell">
      {thumb ? (
        <img className="v-thumb" src={thumb} alt="" loading="lazy" />
      ) : (
        <span className="v-thumb v-thumb-blank" aria-hidden="true" />
      )}
      {meta ? (
        <div>
          <b>{title}</b>
          <small style={{ color: 'var(--muted2)', fontSize: 11 }}>{meta}</small>
        </div>
      ) : (
        <b>{title}</b>
      )}
    </div>
  )
}

/** Square icon action button used inside `.actions`. */
export function IconButton({ icon, title, tone = '', onClick }) {
  return (
    <button
      className={`ibtn ${tone}`.trim()}
      title={title}
      aria-label={title}
      onClick={onClick}
      type="button"
    >
      <Icon name={icon} />
    </button>
  )
}

/** Row class helper: keeps blocked dimming and the exit animation in sync. */
export function rowClass(item, dimmed) {
  return [dimmed ? 'blocked-row' : '', item.exiting ? 'row-exit' : ''].filter(Boolean).join(' ')
}
