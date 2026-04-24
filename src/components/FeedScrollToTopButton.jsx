import { useState, useEffect } from 'react'
import { translations } from '../constants/translations.js'

const SCROLL_THRESHOLD_PX = 200

/**
 * Fixed chevron to scroll the document to top after the user has scrolled the feed.
 */
export function FeedScrollToTopButton({ uiLanguage, onScrollToTop, hidden }) {
  const t = translations[uiLanguage] ?? translations.en
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (hidden) {
      setShow(false)
      return undefined
    }
    const onScroll = () => {
      setShow(window.scrollY > SCROLL_THRESHOLD_PX)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [hidden])

  if (hidden || !show) {
    return null
  }

  return (
    <button
      type="button"
      className="feed-scroll-to-top"
      onClick={onScrollToTop}
      aria-label={t.feedScrollToTopA11y}
    >
      <svg
        className="feed-scroll-to-top__icon"
        viewBox="0 0 24 24"
        width="22"
        height="22"
        aria-hidden
      >
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M18 15l-6-6-6 6"
        />
      </svg>
    </button>
  )
}
