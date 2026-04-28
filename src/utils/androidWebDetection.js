/**
 * True when the page is loaded in a mobile-class browser on Android (phone-first).
 * Uses UA Client Hints `mobile` when available; falls back to "Mobile" in the UA string.
 */
export function isAndroidMobileBrowser() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  if (!/Android/i.test(ua)) return false

  try {
    const uad = navigator.userAgentData
    if (uad && typeof uad.mobile === 'boolean') {
      return uad.mobile === true
    }
  } catch {
    /* ignore */
  }

  // Typical Chrome/Firefox on Android phones include "Mobile"; tablets often omit it.
  if (/\bMobile\b/i.test(ua)) return true

  /* In-app browsers / WebViews on phones */
  return /; wv\)/i.test(ua)
}
