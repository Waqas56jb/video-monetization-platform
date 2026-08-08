import { useLayoutEffect, useRef } from 'react'

/** Apply thead labels onto body cells for phone card layout. */
function applyCardLabels(table) {
  if (!table) return
  const labels = [...table.querySelectorAll('thead th')].map((th) => th.textContent.trim())
  table.querySelectorAll('tbody tr').forEach((tr) => {
    ;[...tr.children].forEach((td, i) => {
      if (labels[i]) td.setAttribute('data-label', labels[i])
    })
  })
}

/** Scrollable table on tablet; stacked labeled cards on phones. */
export default function TableScroll({ children }) {
  const ref = useRef(null)

  useLayoutEffect(() => {
    applyCardLabels(ref.current)
  })

  return (
    <div className="table-scroll tbl-cards">
      <table ref={ref} className="tbl">
        {children}
      </table>
    </div>
  )
}
