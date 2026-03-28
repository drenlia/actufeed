import { useState, useEffect } from 'react'

/** Matches CSS `@media (max-width: 640px)` — phone layout in App.css */
export const PHONE_LAYOUT_MEDIA = '(max-width: 640px)'

/**
 * Subscribes to a media query. SSR-safe (false until mounted when `window` is absent).
 */
export function useMatchMedia(query) {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false
  )

  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setMatches(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])

  return matches
}
