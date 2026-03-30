import { createContext, useContext, useMemo } from 'react'
import { useToast } from '../hooks/useToast'
import { ToastContainer } from '../components/Toast'

const ToastContext = createContext(null)

export const ToastProvider = ({ children }) => {
  const toast = useToast()

  const value = useMemo(
    () => ({
      toasts: toast.toasts,
      showToast: toast.showToast,
      removeToast: toast.removeToast,
      success: toast.success,
      error: toast.error,
      warning: toast.warning,
      info: toast.info,
    }),
    [
      toast.toasts,
      toast.showToast,
      toast.removeToast,
      toast.success,
      toast.error,
      toast.warning,
      toast.info,
    ]
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toast.toasts} removeToast={toast.removeToast} />
    </ToastContext.Provider>
  )
}

export const useToastContext = () => {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToastContext must be used within ToastProvider')
  }
  return context
}
