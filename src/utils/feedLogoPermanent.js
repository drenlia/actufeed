/**
 * Hard-coded feed logos (single known-good URL, no discovery).
 * Montreal Gazette RSS still advertises <channel><image> but the URL host
 * (smartcdn.prod.postmedia.digital) often does not resolve; the working asset
 * below is from Postmedia’s static CDN (same as their apple-touch-icon).
 */
const MONTREAL_GAZETTE_LOGO =
  'https://dcs-static.gprod.postmedia.digital/20.8.2/websites/images/apple-touch-icons/iphone-retina/icon-mg.png'

/**
 * @param {string} feedUrl - source.url
 * @returns {string} absolute image URL or ''
 */
export function getPermanentFeedLogoUrl(feedUrl) {
  if (!feedUrl || typeof feedUrl !== 'string') return ''
  try {
    const u = new URL(feedUrl.trim())
    const host = u.hostname.toLowerCase()
    const path = (u.pathname || '/').replace(/\/+$/, '') || '/'
    const isMg =
      (host === 'montrealgazette.com' || host === 'www.montrealgazette.com') && path === '/feed'
    if (isMg) return MONTREAL_GAZETTE_LOGO
  } catch {
    // ignore
  }
  return ''
}
