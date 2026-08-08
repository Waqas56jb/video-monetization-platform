import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2 } from 'lucide-react'

const ToastContext = createContext(() => {})

/** `showToast(msg)` from anywhere in the tree. */
export function useToast() {
  return useContext(ToastContext)
}

export function ToastProvider({ children }) {
  const [message, setMessage] = useState('Done')
  const [show, setShow] = useState(false)
  const timer = useRef(null)

  const showToast = useCallback((msg) => {
    setMessage(msg)
    setShow(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setShow(false), 3200)
  }, [])

  useEffect(() => () => clearTimeout(timer.current), [])

  const value = useMemo(() => showToast, [showToast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div id="toast" className={show ? 'show' : ''} role="status" aria-live="polite">
        <CheckCircle2 />
        <span>{message}</span>
      </div>
    </ToastContext.Provider>
  )
}
