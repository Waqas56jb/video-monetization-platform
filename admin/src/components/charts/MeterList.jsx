/** Labelled horizontal meters (payment-method / sale-type breakdown). */
export default function MeterList({ meters }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, padding: '8px 4px' }}>
      {meters.map((m) => (
        <div key={m.label}>
          <div
            style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 8 }}
          >
            <span style={{ color: 'var(--muted)' }}>{m.label}</span>
            <b>{m.value}</b>
          </div>
          <div className="split-vis">
            <span style={{ width: m.width, background: m.fill }} />
            <span style={{ background: 'var(--card2)' }} />
          </div>
        </div>
      ))}
    </div>
  )
}
