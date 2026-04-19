import { useState, useEffect } from 'react'

/** Matches CSS `@media (max-width: 640px)` — phone layout in App.css */
export const PHONE_LAYOUT_MEDIA = '(max-width: 640px)'

/** Matches CSS `@media (min-width: 641px)` — desktop/tablet header row in App.css */
export const DESKTOP_HEADER_LAYOUT_MEDIA = '(min-width: 641px)'

/**
 * When true, the help (?) control shows a shortcuts dropdown; when false (touch / iPad / no hover),
 * ? opens Quick help directly and keyboard hints are hidden in the UI.
 */
export const HELP_SHORTCUTS_DROPDOWN_MEDIA = '(min-width: 1025px) and (hover: hover) and (pointer: fine)'

/**
 * When true, guided tour copy omits keyboard shortcuts (phones, tablets, coarse pointer).
 * Matches typical mobile browsers where hardware keyboard shortcuts do not apply.
 */
export const GUIDED_TOUR_TOUCH_COPY_MEDIA = '(hover: none), (pointer: coarse)'

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
