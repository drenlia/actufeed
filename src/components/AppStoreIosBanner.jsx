import { APP_STORE_URL, APP_STORE_BANNER_DISMISSED_KEY, APP_STORE_BADGE_IMG } from '../constants/appStore'
import { translations } from '../constants/translations'

export const AppStoreIosBanner = ({ uiLanguage, visible, onDismiss }) => {
  const t = translations[uiLanguage]
  if (!visible) return null

  return (
    <div className="appstore-ios-banner" role="region" aria-label={t.appStoreIosBannerAria}>
      <div className="appstore-ios-banner__inner">
        <a
          className="appstore-ios-banner__badge-link"
          href={APP_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          <img
            className="appstore-ios-banner__badge"
            src={APP_STORE_BADGE_IMG}
            alt={t.appStoreIosBannerBadgeAlt}
            width={320}
            height={108}
            decoding="async"
          />
        </a>
        <p className="appstore-ios-banner__text">{t.appStoreIosBannerText}</p>
        <button type="button" className="appstore-ios-banner__dismiss" onClick={onDismiss}>
          {t.appStoreIosBannerDismiss}
        </button>
      </div>
    </div>
  )
}

export function readAppStoreBannerDismissed() {
  try {
    return localStorage.getItem(APP_STORE_BANNER_DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

export function persistAppStoreBannerDismissed() {
  try {
    localStorage.setItem(APP_STORE_BANNER_DISMISSED_KEY, '1')
  } catch {
    /* ignore quota / private mode */
  }
}
