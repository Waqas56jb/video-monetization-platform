import Icon from './Icon'

/** Horizontally scrollable table shell — the wide table never scrolls the page. */
export function TableWrap({ children, minWidth }) {
  return (
    <div className="tbl-wrap">
      <table className="tbl" style={minWidth !== undefined ? { minWidth } : undefined}>
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
