/** Thin YouTube-style progress line at the top of the viewport. */
export default function TopProgress({ active }) {
  if (!active) return null
  return (
    <div className="top-progress" role="progressbar" aria-label="Loading">
      <span className="top-progress-bar" />
    </div>
  )
}
