import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useLegalLocale } from './useLegalLocale.js'
import './legal-pages.css'

function initThemeFromStorage() {
  try {
    const raw = localStorage.getItem('newsfeed-settings-preferences')
    const p = raw ? JSON.parse(raw) : {}
    let t = p.theme
    if (t !== 'light' && t !== 'dark') {
      t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
    }
    document.documentElement.dataset.theme = t
  } catch {
    document.documentElement.dataset.theme = 'light'
  }
}

/**
 * @param {{ page: 'support' | 'privacy' | 'contact'; children: import('react').ReactNode }} props
 */
export function LegalPageLayout({ page, children }) {
  const { locale, setLocale, strings } = useLegalLocale()

  useEffect(() => {
    initThemeFromStorage()
  }, [])

  useEffect(() => {
    const docTitle =
      page === 'support'
        ? strings.supportDocTitle
        : page === 'privacy'
          ? strings.privacyDocTitle
          : strings.contactDocTitle
    document.title = `${docTitle} · ActuFeed`
    document.documentElement.lang = locale
    return () => {
      document.title = 'ACTUFEED'
      document.documentElement.lang = 'en'
    }
  }, [page, locale, strings.supportDocTitle, strings.privacyDocTitle, strings.contactDocTitle])

  return (
    <div className="legal-page">
      <div className="legal-page__inner">
        <header className="legal-page__nav">
          <Link to="/" className="legal-page__brand">
            ACTUFEED
          </Link>
          <div className="legal-page__nav-right">
            <nav className="legal-page__links" aria-label="Legal">
              <Link to="/support">{strings.navSupport}</Link>
              <Link to="/contact">{strings.navContact}</Link>
              <Link to="/privacy">{strings.navPrivacy}</Link>
            </nav>
            <div className="legal-page__lang-switch" role="group" aria-label={strings.langLabel}>
              <button
                type="button"
                className={`legal-page__lang-btn ${locale === 'en' ? 'is-active' : ''}`}
                onClick={() => setLocale('en')}
                aria-pressed={locale === 'en'}
              >
                {strings.langEn}
              </button>
              <button
                type="button"
                className={`legal-page__lang-btn ${locale === 'fr' ? 'is-active' : ''}`}
                onClick={() => setLocale('fr')}
                aria-pressed={locale === 'fr'}
              >
                {strings.langFr}
              </button>
            </div>
          </div>
        </header>
        {children}
      </div>
    </div>
  )
}
