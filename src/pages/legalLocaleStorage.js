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

/** Initial locale: saved preference, else browser language (fr vs en), else en. */
export function getInitialLegalLocale() {
  return readStoredLocale() ?? detectBrowserLocale()
}

export { STORAGE_KEY as LEGAL_LOCALE_STORAGE_KEY }
