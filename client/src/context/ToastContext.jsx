import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { isTouchMobile } from '@/lib/socialShare'

const ToastContext = createContext(null)

function useMobileToast() {
  if (typeof window === 'undefined') return false
  return isTouchMobile()
}

/** @deprecated use notify */
export function useToast() {
  const ctx = useContext(ToastContext)
  return ctx?.notify?.success || (() => {})
}

export function useNotify() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useNotify must be used within ToastProvider')
  return ctx.notify
}

export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null)
  const timer = useRef(null)
  const mobile = useMobileToast()

  const dismiss = useCallback(() => {
    clearTimeout(timer.current)
    setToast(null)
  }, [])

  const show = useCallback(
    (kind, message, { retry, duration } = {}) => {
      clearTimeout(timer.current)
      setToast({ kind, message, retry })
      if (kind !== 'error' && duration !== 0) {
        timer.current = setTimeout(() => setToast(null), duration ?? 4000)
      }
    },
    []
  )

  const notify = useMemo(
    () => ({
      success: (msg, opts) => show('success', msg, opts),
      error: (msg, opts) => show('error', msg, { duration: 0, ...opts }),
      info: (msg, opts) => show('info', msg, opts),
    }),
    [show]
  )

  useEffect(() => () => clearTimeout(timer.current), [])

  const Icon = toast?.kind === 'error' ? AlertTriangle : toast?.kind === 'info' ? Info : CheckCircle2

  return (
    <ToastContext.Provider value={{ notify, showToast: notify.success }}>
      {children}
      {toast && (
        <div
          id="toast"
          className={`show is-${toast.kind}${mobile ? ' is-mobile' : ''}`}
          role={toast.kind === 'error' ? 'alert' : 'status'}
          aria-live="polite"
          onClick={dismiss}
        >
          <Icon />
          <span>{toast.message}</span>
          {toast.retry && (
            <button
              type="button"
              className="toast-retry"
              onClick={(e) => {
                e.stopPropagation()
                toast.retry()
                dismiss()
              }}
            >
              Retry
            </button>
          )}
          <button type="button" className="toast-close" onClick={dismiss} aria-label="Dismiss">
            <X size={16} />
          </button>
        </div>
      )}
    </ToastContext.Provider>
  )
}
