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

/** Avatar + name + sub-line cell used by the user/creator tables. */
export function UserCell({ avatar, name, sub }) {
  return (
    <div className="u-cell">
      <img src={avatar} alt="" loading="lazy" />
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
      <img className="v-thumb" src={thumb} alt="" loading="lazy" />
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
