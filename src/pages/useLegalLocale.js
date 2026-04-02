import { useContext } from 'react'
import { LegalLocaleContext } from './legalLocaleContext.js'

export function useLegalLocale() {
  const ctx = useContext(LegalLocaleContext)
  if (!ctx) {
    throw new Error('useLegalLocale must be used under LegalLocaleProvider')
  }
  return ctx
}
