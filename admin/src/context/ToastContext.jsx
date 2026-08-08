import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
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
    // original timeout: 3400ms
    timer.current = setTimeout(() => setShow(false), 3400)
  }, [])

  useEffect(() => () => clearTimeout(timer.current), [])

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div id="toast" className={show ? 'show' : ''} role="status" aria-live="polite">
        <CheckCircle2 />
        <span>{message}</span>
      </div>
    </ToastContext.Provider>
  )
}
