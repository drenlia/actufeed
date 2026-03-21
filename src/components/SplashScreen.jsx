import { useState, useEffect } from 'react'
import './SplashScreen.css'
import { translations } from '../constants/translations'

export const SplashScreen = ({ onComplete }) => {
  const [isVisible, setIsVisible] = useState(true)
  
  // Detect browser language
  const browserLang = navigator.language || navigator.userLanguage
  const detectedLang = browserLang.startsWith('fr') ? 'fr' : 'en'
  const t = translations[detectedLang]

  useEffect(() => {
    // Check if splash has been shown before
    const splashShown = localStorage.getItem('splashScreenShown')
    
    console.log('[SplashScreen] Checking localStorage - splashScreenShown:', splashShown)
    console.log('[SplashScreen] isVisible state:', isVisible)
    
    if (splashShown) {
      // Skip splash screen if already shown
      console.log('[SplashScreen] Skipping splash - already shown before')
      setIsVisible(false)
      onComplete?.()
      return
    }

    console.log('[SplashScreen] Showing splash for 3 seconds!')
    
    // DON'T mark as shown yet - wait until splash completes
    // This prevents React StrictMode double-render from skipping the splash
    
    // Auto-dismiss after 3 seconds
    const timer = setTimeout(() => {
      console.log('[SplashScreen] Auto-dismissing after 3 seconds')
      // Mark as shown BEFORE dismissing
      localStorage.setItem('splashScreenShown', 'true')
      handleDismiss()
    }, 3000)

    return () => clearTimeout(timer)
  }, [onComplete])

  const handleDismiss = () => {
    // Mark as shown when dismissing
    localStorage.setItem('splashScreenShown', 'true')
    setIsVisible(false)
    setTimeout(() => {
      onComplete?.()
    }, 500) // Wait for fade-out animation
  }

  if (!isVisible) return null

  return (
    <div className="splash-overlay">
      <div className="splash-content">
        {/* Newspaper Icon - extracted from SVG */}
        <div className="splash-icon">
          {/* Document/Paper */}
          <div className="splash-document">
            {/* Folded corner effect */}
            <div className="splash-fold"></div>
            
            {/* Headline bar */}
            <div className="splash-headline"></div>
            
            {/* Text lines */}
            <div className="splash-text-lines">
              <div className="splash-line"></div>
              <div className="splash-line"></div>
              <div className="splash-line"></div>
            </div>
            
            {/* RSS waves (bottom right) */}
            <div className="splash-rss">
              <div className="splash-rss-ring"></div>
              <div className="splash-rss-dot"></div>
            </div>
          </div>
        </div>

        {/* ACTUFEED Text - uses translation */}
        <h1 className="splash-title">{t.title}</h1>

        {/* Dismiss button */}
        <button className="splash-dismiss" onClick={handleDismiss} aria-label="Skip">
          Skip
        </button>
      </div>
    </div>
  )
}
