import { useState, useEffect } from 'react'
import { isIOSOrIPadBrowser } from '../utils/iosWebDetection'

/** Hydration-safe: false until mounted, then matches iPhone/iPad web. */
export function useAppleMobileWeb() {
  const [value, setValue] = useState(false)
  useEffect(() => {
    setValue(isIOSOrIPadBrowser())
  }, [])
  return value
}
