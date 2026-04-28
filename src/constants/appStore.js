/** US App Store listing — ActuFeed (native iOS/iPadOS app) */
export const APP_STORE_URL = 'https://apps.apple.com/us/app/actufeed/id6761419091'

/** Google Play listing — same native app (`com.actufeed.app` from Expo config). */
export const GOOGLE_PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.actufeed.app'

/** English “Download on the App Store” badge (`public/…`). */
export const APP_STORE_BADGE_IMG_EN = '/download-on-the-app-store-badge.png'

/** Français (Canada) App Store badge. */
export const APP_STORE_BADGE_IMG_FR = '/download-on-the-app-store-badge-FRCA.png'

/** @deprecated Prefer {@link APP_STORE_BADGE_IMG_EN} or {@link appStoreBadgePathForLanguage}. */
export const APP_STORE_BADGE_IMG = APP_STORE_BADGE_IMG_EN

/** Google Play badge art (localized filenames in `public/`). */
export const GOOGLE_PLAY_BADGE_IMG_EN = '/GetItOnGooglePlay_Badge_Web_color_English.png'
export const GOOGLE_PLAY_BADGE_IMG_FR = '/GetItOnGooglePlay_Badge_Web_color_French-CA.png'

export function appStoreBadgePathForLanguage(uiLanguage) {
  return uiLanguage === 'fr' ? APP_STORE_BADGE_IMG_FR : APP_STORE_BADGE_IMG_EN
}

export function googlePlayBadgePathForLanguage(uiLanguage) {
  return uiLanguage === 'fr' ? GOOGLE_PLAY_BADGE_IMG_FR : GOOGLE_PLAY_BADGE_IMG_EN
}

export const APP_STORE_BANNER_DISMISSED_KEY = 'actufeed-appstore-banner-dismissed'

export const GOOGLE_PLAY_ANDROID_BANNER_DISMISSED_KEY = 'actufeed-googleplay-android-banner-dismissed'
