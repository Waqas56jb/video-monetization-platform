import { useState } from 'react'
import { useToast } from '@/context/ToastContext'
import { TOASTS } from '@/data/adminData'

/** The pill toggle used by every settings row. */
export default function Switch({ defaultOn = false, label }) {
  const [on, setOn] = useState(defaultOn)
  const showToast = useToast()

  return (
    <button
      type="button"
      className={`switch ${on ? 'on' : ''}`.trim()}
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => {
        setOn((v) => !v)
        showToast(TOASTS.settingSaved)
      }}
    />
  )
}

/** Title + description on the left, switch on the right. */
export function ToggleRow({ setting }) {
  return (
    <div className="toggle-row">
      <div>
        <b>{setting.title}</b>
        <small>{setting.note}</small>
      </div>
      <Switch defaultOn={setting.on} label={setting.title} />
    </div>
  )
}
