import { useMemo } from 'react'
import { duration } from '@/hooks/useApi'

/**
 * How much of the video is free.
 *
 * A number and a unit, rather than a fixed list of choices. "5 minutes" suits a
 * music video and suits nothing else: a 45-second teaser of a 3-minute song, or
 * the first half-hour of a two-hour film, are both perfectly ordinary and
 * neither fits a dropdown of preset minutes.
 *
 * The ceiling is half the running time. A preview of duration-minus-one second
 * (53s free of a 54s video) is the whole film for nothing, not a preview.
 */
const UNITS = [
  { key: 'seconds', label: 'seconds', factor: 1 },
  { key: 'minutes', label: 'minutes', factor: 60 },
  { key: 'hours', label: 'hours', factor: 3600 },
]

/** Longest free preview allowed once the running time is known. Must match the server. */
export function maxFreePreviewSeconds(durationSeconds) {
  const duration = Math.max(0, Math.round(Number(durationSeconds) || 0))
  if (!duration) return null
  return Math.floor(duration / 2)
}

/** Show a number of seconds in whichever unit reads most naturally. */
export function splitSeconds(totalSeconds) {
  const s = Math.max(0, Math.round(Number(totalSeconds) || 0))
  if (s === 0) return { value: 0, unit: 'seconds' }
  if (s % 3600 === 0) return { value: s / 3600, unit: 'hours' }
  if (s % 60 === 0) return { value: s / 60, unit: 'minutes' }
  return { value: s, unit: 'seconds' }
}

export const toSeconds = (value, unit) =>
  Math.max(0, Math.round(Number(value) || 0)) * (UNITS.find((u) => u.key === unit)?.factor ?? 1)

export default function PreviewDuration({
  value,
  unit,
  onChange,
  videoSeconds = 0,
  id = 'preview-duration',
}) {
  const seconds = toSeconds(value, unit)

  const maxSeconds = maxFreePreviewSeconds(videoSeconds)
  const overLimit = maxSeconds !== null && seconds > maxSeconds

  const maxInThisUnit = useMemo(() => {
    if (maxSeconds === null) return undefined
    const factor = UNITS.find((u) => u.key === unit)?.factor ?? 1
    return Math.max(0, Math.floor(maxSeconds / factor))
  }, [maxSeconds, unit])

  /** Changing the unit keeps the same real length rather than the same digits. */
  const switchUnit = (nextUnit) => {
    const converted = seconds / (UNITS.find((u) => u.key === nextUnit)?.factor ?? 1)
    // Whole numbers where they work, one decimal where they do not.
    const rounded = Number.isInteger(converted) ? converted : Math.round(converted * 10) / 10
    onChange({ value: rounded, unit: nextUnit })
  }

  return (
    <div className="field">
      <label htmlFor={id}>Free preview</label>

      <div className="dur-row">
        <div className="input-wrap dur-value">
          <input
            id={id}
            type="number"
            min={0}
            max={maxInThisUnit}
            step={unit === 'seconds' ? 1 : 'any'}
            value={value}
            onChange={(e) => onChange({ value: e.target.value, unit })}
          />
        </div>

        <div className="dur-units" role="group" aria-label="Unit">
          {UNITS.map((u) => (
            <button
              key={u.key}
              type="button"
              className={unit === u.key ? 'on' : ''}
              onClick={() => switchUnit(u.key)}
              aria-pressed={unit === u.key}
            >
              {u.label}
            </button>
          ))}
        </div>
      </div>

      {/* Always say what was actually chosen, in plain time. 90 seconds and
          1.5 minutes are the same thing and one of them is easier to picture. */}
      <p className={`field-hint ${overLimit ? 'is-bad' : ''}`.trim()}>
        {seconds === 0 ? (
          'No free preview — viewers see the paywall straight away.'
        ) : overLimit ? (
          <>
            A free preview cannot be most of the video. The most you can give away is{' '}
            {duration(maxSeconds)} of {duration(videoSeconds)} — half, so there is something left
            to pay for.
          </>
        ) : (
          <>
            Viewers watch <b>{duration(seconds)}</b> free
            {videoSeconds > 0 && <> of {duration(videoSeconds)}</>}
            {videoSeconds > 0 && <> — {Math.round((seconds / videoSeconds) * 100)}% of it</>}, then
            the paywall appears.
          </>
        )}
      </p>
    </div>
  )
}
