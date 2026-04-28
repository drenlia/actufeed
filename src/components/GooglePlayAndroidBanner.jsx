import { GOOGLE_PLAY_STORE_URL, googlePlayBadgePathForLanguage } from '../constants/appStore'
import { translations } from '../constants/translations'

export function GooglePlayAndroidBanner({ uiLanguage, visible, onDismiss }) {
  const t = translations[uiLanguage]
  if (!visible) return null

  return (
    <div className="googleplay-android-banner" role="region" aria-label={t.googlePlayAndroidBannerAria}>
      <div className="googleplay-android-banner__inner">
        <a
          className="googleplay-android-banner__badge-link"
          href={GOOGLE_PLAY_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          <img
            className="googleplay-android-banner__badge"
            src={googlePlayBadgePathForLanguage(uiLanguage)}
            alt={t.googlePlayAndroidBannerBadgeAlt}
            width={564}
            height={168}
            decoding="async"
          />
        </a>
        <p className="googleplay-android-banner__text">{t.googlePlayAndroidBannerText}</p>
        <button type="button" className="googleplay-android-banner__dismiss" onClick={onDismiss}>
          {t.googlePlayAndroidBannerDismiss}
        </button>
      </div>
    </div>
  )
}

export function readGooglePlayAndroidBannerDismissed() {
  try {
    return localStorage.getItem(GOOGLE_PLAY_ANDROID_BANNER_DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

export function persistGooglePlayAndroidBannerDismissed() {
  try {
    localStorage.setItem(GOOGLE_PLAY_ANDROID_BANNER_DISMISSED_KEY, '1')
  } catch {
    /* ignore quota / private mode */
  }
}
