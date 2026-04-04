import { useState, useEffect } from 'react'

/**
 * Current `window.innerWidth` (0 during SSR / before mount).
 */
export function useWindowWidth() {
  const [w, setW] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 0
  )

  useEffect(() => {
    const onResize = () => setW(window.innerWidth)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return w
}
