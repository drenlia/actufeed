import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { legalStrings } from './legalTranslations.js'

const STORAGE_KEY = 'actufeed-legal-locale'

function detectBrowserLocale() {
  if (typeof navigator === 'undefined') return 'en'
  const list = navigator.languages?.length ? navigator.languages : [navigator.language || 'en']
  for (const lang of list) {
    const base = String(lang).toLowerCase().split('-')[0]
    if (base === 'fr') return 'fr'
    if (base === 'en') return 'en'
  }
  return 'en'
}

function readStoredLocale() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'en' || raw === 'fr') return raw
  } catch {
    /* ignore */
  }
  return null
}

export function getInitialLegalLocale() {
  return readStoredLocale() ?? detectBrowserLocale()
}

const LegalLocaleContext = createContext(null)

export function LegalLocaleProvider({ children }) {
  const [locale, setLocaleState] = useState(getInitialLegalLocale)

  const setLocale = useCallback((next) => {
    if (next !== 'en' && next !== 'fr') return
    setLocaleState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* ignore */
    }
  }, [])

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      strings: legalStrings[locale] || legalStrings.en,
    }),
    [locale, setLocale]
  )

  return <LegalLocaleContext.Provider value={value}>{children}</LegalLocaleContext.Provider>
}

export function useLegalLocale() {
  const ctx = useContext(LegalLocaleContext)
  if (!ctx) {
    throw new Error('useLegalLocale must be used under LegalLocaleProvider')
  }
  return ctx
}
