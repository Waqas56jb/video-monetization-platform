import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { AlertTriangle, X } from 'lucide-react'
import useLockBodyScroll from '@/hooks/useLockBodyScroll'

const ConfirmContext = createContext(() => {})

/**
 * `confirm({ title, text, onConfirm })` — the red danger dialog that guards
 * every destructive admin action.
 */
export function useConfirm() {
  return useContext(ConfirmContext)
}

export function ConfirmProvider({ children }) {
  const [state, setState] = useState({ open: false, title: '', text: '' })
  const onConfirmRef = useRef(null)

  useLockBodyScroll(state.open)

  const confirm = useCallback(({ title, text, onConfirm }) => {
    onConfirmRef.current = onConfirm
    setState({ open: true, title, text })
  }, [])

  const close = useCallback(() => {
    setState((s) => ({ ...s, open: false }))
    onConfirmRef.current = null
  }, [])

  const accept = useCallback(() => {
    const fn = onConfirmRef.current
    close()
    fn?.()
  }, [close])

  // Escape closes, like any well-behaved dialog.
  useEffect(() => {
    if (!state.open) return
    const onKey = (e) => e.key === 'Escape' && close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state.open, close])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}

      <div
        className={`modal ${state.open ? 'open' : ''}`.trim()}
        role="alertdialog"
        aria-modal="true"
        aria-label={state.title}
      >
        <div className="modal-bg" onClick={close} />
        <div className="modal-card">
          <button className="modal-x" onClick={close} aria-label="Close">
            <X />
          </button>
          <div className="danger-ic">
            <AlertTriangle />
          </div>
          <h3>{state.title || 'Are you sure?'}</h3>
          <p className="msub">{state.text || 'This action cannot be undone.'}</p>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={close}>
              Cancel
            </button>
            <button
              className="btn btn-red"
              style={{ background: 'linear-gradient(135deg,#ef4444,#b91c1c)', color: '#fff', border: 'none' }}
              onClick={accept}
            >
              Yes, Confirm
            </button>
          </div>
        </div>
      </div>
    </ConfirmContext.Provider>
  )
}
