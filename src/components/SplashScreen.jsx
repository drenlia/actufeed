import { useEffect, useCallback } from 'react'
import './SplashScreen.css'
import { translations } from '../constants/translations'

export const SplashScreen = ({ onComplete }) => {
  const browserLang = navigator.language || navigator.userLanguage
  const detectedLang = browserLang.startsWith('fr') ? 'fr' : 'en'
  const t = translations[detectedLang]

  const finish = useCallback(() => {
    try {
      localStorage.setItem('splashScreenShown', 'true')
    } catch {
      /* ignore quota / private mode */
    }
    onComplete?.()
  }, [onComplete])

  useEffect(() => {
    const splashShown = localStorage.getItem('splashScreenShown')
    if (splashShown) {
      finish()
      return undefined
    }
    const timer = setTimeout(finish, 3000)
    return () => clearTimeout(timer)
  }, [finish])

  return (
    <div className="splash-overlay">
      <div className="splash-content">
        <div className="splash-icon">
          <div className="splash-document">
            <div className="splash-fold"></div>
            <div className="splash-headline"></div>
            <div className="splash-text-lines">
              <div className="splash-line"></div>
              <div className="splash-line"></div>
              <div className="splash-line"></div>
            </div>
            <div className="splash-rss">
              <div className="splash-rss-ring"></div>
              <div className="splash-rss-dot"></div>
            </div>
          </div>
        </div>

        <h1 className="splash-title">{t.title}</h1>

        <button type="button" className="splash-dismiss" onClick={finish} aria-label="Skip">
          Skip
        </button>
      </div>
    </div>
  )
}
