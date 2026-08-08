/** The rounded card used for every dashboard block. */
export default function Panel({ title, action, children, className = '', style, headStyle }) {
  return (
    <div className={`panel ${className}`.trim()} style={style}>
      {(title || action) && (
        <div className="panel-head" style={headStyle}>
          {title && <h3>{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </div>
  )
}
