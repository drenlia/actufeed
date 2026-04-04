// Utilities for storing settings preferences (like selected country filters)
import { clampFeedDescriptionFontScale } from './feedLayoutPrefs'

const SETTINGS_STORAGE_KEY = 'newsfeed-settings-preferences'

/** Filters panel hidden until the user opens it; explicit false/true in storage overrides. */
const DEFAULT_SUBHEADER_COLLAPSED = true

export const loadSettingsPreferences = () => {
  try {
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      const theme =
        parsed.theme === 'dark' || parsed.theme === 'light'
          ? parsed.theme
          : typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light'
      const layoutPref = parsed.feedLayoutPreference
      const feedLayoutPreference =
        layoutPref === 'list' || layoutPref === 'columns2' || layoutPref === 'columns3' || layoutPref === 'auto'
          ? layoutPref
          : 'auto'
      return {
        selectedCountries: new Set(parsed.selectedCountries || []),
        subheaderCollapsed:
          typeof parsed.subheaderCollapsed === 'boolean' ? parsed.subheaderCollapsed : DEFAULT_SUBHEADER_COLLAPSED,
        showToastMessages: parsed.showToastMessages !== undefined ? parsed.showToastMessages : false,
        mobileHeaderCompactToolbar:
          typeof parsed.mobileHeaderCompactToolbar === 'boolean' ? parsed.mobileHeaderCompactToolbar : true,
        feedHeaderWebShrunk:
          typeof parsed.feedHeaderWebShrunk === 'boolean' ? parsed.feedHeaderWebShrunk : false,
        theme,
        feedLayoutPreference,
        feedDescriptionFontScale: clampFeedDescriptionFontScale(
          typeof parsed.feedDescriptionFontScale === 'number' ? parsed.feedDescriptionFontScale : 1
        ),
      }
    }
  } catch (error) {
    console.warn('Failed to load settings preferences:', error)
  }

  const theme =
    typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'

  return {
    selectedCountries: new Set(),
    subheaderCollapsed: DEFAULT_SUBHEADER_COLLAPSED,
    showToastMessages: false, // Default to hiding toast messages
    mobileHeaderCompactToolbar: true,
    feedHeaderWebShrunk: false,
    theme,
    feedLayoutPreference: 'auto',
    feedDescriptionFontScale: 1,
  }
}

export const saveSettingsPreferences = (preferences) => {
  try {
    const stored = loadSettingsPreferences()
    const toStore = {
      selectedCountries: preferences.selectedCountries
        ? Array.from(preferences.selectedCountries)
        : stored.selectedCountries instanceof Set
          ? Array.from(stored.selectedCountries)
          : stored.selectedCountries,
      subheaderCollapsed:
        preferences.subheaderCollapsed !== undefined ? preferences.subheaderCollapsed : stored.subheaderCollapsed,
      showToastMessages:
        preferences.showToastMessages !== undefined ? preferences.showToastMessages : stored.showToastMessages,
      mobileHeaderCompactToolbar:
        preferences.mobileHeaderCompactToolbar !== undefined
          ? preferences.mobileHeaderCompactToolbar
          : stored.mobileHeaderCompactToolbar,
      feedHeaderWebShrunk:
        preferences.feedHeaderWebShrunk !== undefined
          ? preferences.feedHeaderWebShrunk
          : stored.feedHeaderWebShrunk,
      theme: preferences.theme !== undefined ? preferences.theme : stored.theme,
      feedLayoutPreference:
        preferences.feedLayoutPreference !== undefined
          ? preferences.feedLayoutPreference
          : stored.feedLayoutPreference,
      feedDescriptionFontScale:
        preferences.feedDescriptionFontScale !== undefined
          ? clampFeedDescriptionFontScale(preferences.feedDescriptionFontScale)
          : stored.feedDescriptionFontScale,
    }
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(toStore))
    return true
  } catch (error) {
    console.error('Failed to save settings preferences:', error)
    return false
  }
}
