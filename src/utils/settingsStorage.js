// Utilities for storing settings preferences (like selected country filters)
import { clampFeedDescriptionFontScale } from './feedLayoutPrefs'

const SETTINGS_STORAGE_KEY = 'newsfeed-settings-preferences'

/** Filters panel hidden until the user opens it; explicit false/true in storage overrides. */
const DEFAULT_SUBHEADER_COLLAPSED = true

/** Shared across all feed tabs (not per-tab). */
export const defaultGlobalFeedFilters = () => ({
  newsFilter: 'all',
  selectedCategories: [],
  sortBy: 'date',
  showHighlyRated: false,
  searchQuery: '',
  sourceNameFilter: '',
  minPopularityScore: null,
})

const coerceGlobalFeedFilters = (raw) => {
  const d = defaultGlobalFeedFilters()
  if (!raw || typeof raw !== 'object') return d
  const newsFilter = raw.newsFilter === 'fr' || raw.newsFilter === 'en' ? raw.newsFilter : 'all'
  const sortBy = raw.sortBy === 'popularity' ? 'popularity' : 'date'
  const selectedCategories = Array.isArray(raw.selectedCategories)
    ? raw.selectedCategories.filter((x) => typeof x === 'string')
    : []
  const showHighlyRated = raw.showHighlyRated === true
  const searchQuery = typeof raw.searchQuery === 'string' ? raw.searchQuery : ''
  const sourceNameFilter = typeof raw.sourceNameFilter === 'string' ? raw.sourceNameFilter : ''
  let minPopularityScore = null
  const minP = raw.minPopularityScore
  if (typeof minP === 'number' && minP > 0 && Number.isFinite(minP)) {
    minPopularityScore = Math.min(99, Math.floor(minP))
  }
  return {
    newsFilter,
    selectedCategories,
    sortBy,
    showHighlyRated,
    searchQuery,
    sourceNameFilter,
    minPopularityScore,
  }
}

/**
 * true = short strip (stronger crop). false = taller 4:3 softer crop (default).
 * Legacy `feedColumnImageFitContain`: true meant soft/taller → compact false; false meant strip → compact true.
 */
function coerceFeedColumnCompactImageCrop(parsed) {
  if (!parsed || typeof parsed !== 'object') return false
  if (typeof parsed.feedColumnCompactImageCrop === 'boolean') {
    return parsed.feedColumnCompactImageCrop
  }
  if (typeof parsed.feedColumnImageFitContain === 'boolean') {
    return !parsed.feedColumnImageFitContain
  }
  return false
}

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
        openArticleInReader:
          typeof parsed.openArticleInReader === 'boolean' ? parsed.openArticleInReader : true,
        feedColumnCompactImageCrop: coerceFeedColumnCompactImageCrop(parsed),
        feedGlobalFilters: coerceGlobalFeedFilters(parsed.feedGlobalFilters),
        uiLanguage:
          parsed.uiLanguage === 'fr' || parsed.uiLanguage === 'en' ? parsed.uiLanguage : undefined,
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
    openArticleInReader: true,
    feedColumnCompactImageCrop: false,
    feedGlobalFilters: defaultGlobalFeedFilters(),
    uiLanguage: undefined,
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
      openArticleInReader:
        preferences.openArticleInReader !== undefined
          ? preferences.openArticleInReader
          : stored.openArticleInReader !== false,
      feedColumnCompactImageCrop:
        preferences.feedColumnCompactImageCrop !== undefined
          ? preferences.feedColumnCompactImageCrop
          : stored.feedColumnCompactImageCrop,
      feedGlobalFilters:
        preferences.feedGlobalFilters !== undefined
          ? coerceGlobalFeedFilters(preferences.feedGlobalFilters)
          : coerceGlobalFeedFilters(stored.feedGlobalFilters),
      uiLanguage:
        preferences.uiLanguage !== undefined
          ? preferences.uiLanguage === 'fr'
            ? 'fr'
            : preferences.uiLanguage === 'en'
              ? 'en'
              : stored.uiLanguage
          : stored.uiLanguage,
    }
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(toStore))
    return true
  } catch (error) {
    console.error('Failed to save settings preferences:', error)
    return false
  }
}
