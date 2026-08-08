/** Fixed aurora blobs + film-grain overlay that sit behind every screen. */
export default function BackgroundFX() {
  return (
    <>
      <div className="aurora" aria-hidden="true">
        <span className="a1" />
        <span className="a2" />
        <span className="a3" />
      </div>
      <div className="grain" aria-hidden="true" />
    </>
  )
}
