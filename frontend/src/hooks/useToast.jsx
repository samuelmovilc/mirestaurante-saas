import { useState, useCallback } from 'react'

let id = 0

export function useToast() {
  const [toasts, setToasts] = useState([])

  const toast = useCallback((msg, type = 'success', duration = 2800) => {
    const tid = ++id
    setToasts(prev => [...prev, { id: tid, msg, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== tid)), duration)
  }, [])

  const ToastContainer = () => (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type}`}>
          <span>{t.type === 'success' ? '✓' : t.type === 'error' ? '✕' : 'ℹ'}</span>
          {t.msg}
        </div>
      ))}
    </div>
  )

  return { toast, ToastContainer }
}
