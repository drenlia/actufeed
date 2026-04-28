import { useState, useEffect } from 'react'
import { isAndroidMobileBrowser } from '../utils/androidWebDetection'

/** Hydration-safe: false until mounted, then matches Chrome/Firefox web on Android phones. */
export function useAndroidMobileWeb() {
  const [value, setValue] = useState(false)
  useEffect(() => {
    setValue(isAndroidMobileBrowser())
  }, [])
  return value
}
