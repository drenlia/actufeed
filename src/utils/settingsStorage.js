// Utilities for storing settings preferences (like selected country filters)
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
      return {
        selectedCountries: new Set(parsed.selectedCountries || []),
        subheaderCollapsed:
          typeof parsed.subheaderCollapsed === 'boolean' ? parsed.subheaderCollapsed : DEFAULT_SUBHEADER_COLLAPSED,
        showToastMessages: parsed.showToastMessages !== undefined ? parsed.showToastMessages : false,
        theme,
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
    theme,
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
      theme: preferences.theme !== undefined ? preferences.theme : stored.theme,
    }
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(toStore))
    return true
  } catch (error) {
    console.error('Failed to save settings preferences:', error)
    return false
  }
}
