/**
 * True when the page is loaded in Safari (or WKWebView) on iPhone or iPad.
 * Covers iPadOS 13+ where the UA may report as desktop Mac.
 */
export function isIOSOrIPadBrowser() {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  if (/iPad|iPhone|iPod/.test(ua)) return true
  if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return true
  return false
}
