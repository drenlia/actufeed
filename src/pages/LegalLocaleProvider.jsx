import { useCallback, useMemo, useState } from 'react'
import { legalStrings } from './legalTranslations.js'
import { getInitialLegalLocale, LEGAL_LOCALE_STORAGE_KEY } from './legalLocaleStorage.js'
import { LegalLocaleContext } from './legalLocaleContext.js'

export function LegalLocaleProvider({ children }) {
  const [locale, setLocaleState] = useState(getInitialLegalLocale)

  const setLocale = useCallback((next) => {
    if (next !== 'en' && next !== 'fr') return
    setLocaleState(next)
    try {
      localStorage.setItem(LEGAL_LOCALE_STORAGE_KEY, next)
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
