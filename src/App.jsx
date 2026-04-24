import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react'
import './App.css'
import { useMultiTabNews } from './hooks/useMultiTabNews'
import { useCategories } from './hooks/useCategories'
import { getCombinedCategories, getAvailableCategories } from './utils/categoryCombiner'
import { filterNews, sortNews } from './utils/newsFilters'
import { Header } from './components/Header'
import { SubHeader } from './components/SubHeader'
import { NewsList } from './components/NewsList'
import { Settings } from './components/Settings'
import { TabNavigation } from './components/TabNavigation'
import { SplashScreen } from './components/SplashScreen'
import { HelpModal } from './components/HelpModal'
import { ArticleReaderModal } from './components/ArticleReaderModal'
import { ToastProvider } from './contexts/ToastContext'
import {
  loadTabs,
  getActiveTabId,
  setActiveTabId,
  getTabFilters,
  updateTabName,
  saveTabs,
  getNextTabIdCyclic,
} from './utils/tabsStorage'
import {
  loadSettingsPreferences,
  saveSettingsPreferences,
  defaultGlobalFeedFilters,
} from './utils/settingsStorage'
import {
  resolveFeedLayout,
  clampFeedDescriptionFontScale,
  FEED_DESC_FONT_SCALE_MIN,
  FEED_DESC_FONT_SCALE_MAX,
  FEED_DESC_FONT_SCALE_STEP,
} from './utils/feedLayoutPrefs'
import { useWindowWidth } from './hooks/useWindowWidth'
import { countExpandableDescriptionItems } from './utils/newsDescriptionExpand'
import {
  loadReadLaterList,
  addReadLaterFromNewsItem,
  removeReadLater,
  savedArticleToNewsItem,
} from './utils/readLaterStorage'
import { translations } from './constants/translations'
import { DESKTOP_HEADER_LAYOUT_MEDIA, useMatchMedia } from './hooks/useMatchMedia'
import { useAppleMobileWeb } from './hooks/useAppleMobileWeb'
import { AppStoreIosBanner, persistAppStoreBannerDismissed, readAppStoreBannerDismissed } from './components/AppStoreIosBanner'
import { AppStoreQrModal } from './components/AppStoreQrModal'
import { isMinusKey, isPlusKey, isTypingInField } from './utils/keyboardShortcuts'
import { FeedScrollToTopButton } from './components/FeedScrollToTopButton'
import { WelcomeModal } from './components/WelcomeModal'
import { GuidedTourOverlay } from './components/GuidedTourOverlay'
import { isWelcomeTourCompleted, markWelcomeTourCompleted } from './utils/welcomeTourStorage'
import { GUIDED_TOUR_STEP_COUNT } from './constants/guidedTour'

// Inner App component that uses hooks (must be inside ToastProvider)
function AppContent() {
  const [uiLanguage, setUiLanguage] = useState(() => {
    const p = loadSettingsPreferences()
    if (p.uiLanguage === 'fr' || p.uiLanguage === 'en') return p.uiLanguage
    if (typeof navigator !== 'undefined') {
      const browserLang = navigator.language || ''
      return browserLang.startsWith('fr') ? 'fr' : 'en'
    }
    return 'en'
  })
  const [newsFilter, setNewsFilter] = useState('all') // 'all', 'fr', 'en'
  const [selectedCategories, setSelectedCategories] = useState(new Set())
  const [sortBy, setSortBy] = useState('date') // 'date' or 'popularity'
  const [showHighlyRated, setShowHighlyRated] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [sourceNameFilter, setSourceNameFilter] = useState('')
  const [minPopularityScore, setMinPopularityScore] = useState(null)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  const [activeTabId, setActiveTabIdState] = useState(null)
  const [tabs, setTabs] = useState([])
  const [subheaderCollapsed, setSubheaderCollapsed] = useState(
    () => loadSettingsPreferences().subheaderCollapsed
  )
  const [showToastMessages, setShowToastMessages] = useState(false)
  /** Skip mounting splash when already completed — avoids SplashScreen returning null while showSplash is still true (blank flash). */
  const [showSplash, setShowSplash] = useState(() => {
    if (typeof window === 'undefined') return true
    try {
      return localStorage.getItem('splashScreenShown') !== 'true'
    } catch {
      return true
    }
  })
  const [colorMode, setColorMode] = useState(() => loadSettingsPreferences().theme)
  const [descExpandAllSignal, setDescExpandAllSignal] = useState({ nonce: 0, expanded: true })
  const [descBulkExpanded, setDescBulkExpanded] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [helpFocusSectionId, setHelpFocusSectionId] = useState(null)
  const [mobileHeaderCompactToolbar, setMobileHeaderCompactToolbar] = useState(
    () => loadSettingsPreferences().mobileHeaderCompactToolbar
  )
  const [feedHeaderWebShrunk, setFeedHeaderWebShrunk] = useState(
    () => loadSettingsPreferences().feedHeaderWebShrunk
  )
  const [feedLayoutPreference, setFeedLayoutPreference] = useState(
    () => loadSettingsPreferences().feedLayoutPreference ?? 'auto'
  )
  const [feedDescriptionFontScale, setFeedDescriptionFontScale] = useState(() =>
    clampFeedDescriptionFontScale(loadSettingsPreferences().feedDescriptionFontScale ?? 1)
  )
  const [openArticleInReader, setOpenArticleInReader] = useState(
    () => loadSettingsPreferences().openArticleInReader !== false
  )
  const [feedColumnCompactImageCrop, setFeedColumnCompactImageCrop] = useState(
    () => loadSettingsPreferences().feedColumnCompactImageCrop === true
  )
  const [feedView, setFeedView] = useState('feed')
  const [readLaterItems, setReadLaterItems] = useState(() => loadReadLaterList())
  const [articleReaderItem, setArticleReaderItem] = useState(null)
  const viewportWidth = useWindowWidth()
  const isWideFeedHeaderLayout = useMatchMedia(DESKTOP_HEADER_LAYOUT_MEDIA)
  const isAppleMobileWeb = useAppleMobileWeb()
  const [appStoreBannerDismissed, setAppStoreBannerDismissed] = useState(() =>
    readAppStoreBannerDismissed()
  )
  const [appStoreQrModalOpen, setAppStoreQrModalOpen] = useState(false)

  const [showWelcomeModal, setShowWelcomeModal] = useState(false)
  const [guidedTourActive, setGuidedTourActive] = useState(false)
  const [tourStepIndex, setTourStepIndex] = useState(0)
  const tourStepRef = useRef(0)

  const showAppStoreIosBanner = isAppleMobileWeb && !appStoreBannerDismissed
  const showAppStoreDesktopPromo = !isAppleMobileWeb && isWideFeedHeaderLayout

  const reloadReadLater = useCallback(() => {
    setReadLaterItems(loadReadLaterList())
  }, [])

  const emptyNewItemIds = useMemo(() => new Set(), [])

  useEffect(() => {
    document.documentElement.dataset.theme = colorMode
  }, [colorMode])

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const handleTitleClick = useCallback(() => {
    if (feedView === 'saved') {
      setFeedView('feed')
    }
    scrollToTop()
  }, [feedView, scrollToTop])

  const handleSavedArticlesNav = useCallback(() => {
    setFeedView((v) => (v === 'saved' ? 'feed' : 'saved'))
  }, [])

  useLayoutEffect(() => {
    window.scrollTo(0, 0)
  }, [feedView])

  const handleToggleSavedArticle = useCallback(
    (item) => {
      const id = item.id
      if (readLaterItems.some((i) => i.id === id)) {
        removeReadLater(id)
      } else {
        addReadLaterFromNewsItem(item)
      }
      reloadReadLater()
    },
    [readLaterItems, reloadReadLater]
  )

  const handleRemoveSavedArticle = useCallback(
    (id) => {
      removeReadLater(id)
      reloadReadLater()
    },
    [reloadReadLater]
  )

  const toggleColorMode = useCallback(() => {
    setColorMode((m) => {
      const next = m === 'dark' ? 'light' : 'dark'
      saveSettingsPreferences({ theme: next })
      return next
    })
  }, [])

  const handleUiLanguageToggle = useCallback(() => {
    setUiLanguage((prev) => {
      const next = prev === 'fr' ? 'en' : 'fr'
      saveSettingsPreferences({ uiLanguage: next })
      return next
    })
  }, [])

  // Load tabs on mount and read active tab from URL or localStorage
  useEffect(() => {
    // Load subheader collapsed state and toast messages preference from preferences
    const preferences = loadSettingsPreferences()
    if (preferences.uiLanguage === 'fr' || preferences.uiLanguage === 'en') {
      setUiLanguage(preferences.uiLanguage)
    }
    setSubheaderCollapsed(preferences.subheaderCollapsed)
    setShowToastMessages(preferences.showToastMessages !== undefined ? preferences.showToastMessages : false)
    setColorMode(preferences.theme)
    setMobileHeaderCompactToolbar(preferences.mobileHeaderCompactToolbar)
    setFeedHeaderWebShrunk(preferences.feedHeaderWebShrunk)
    setFeedLayoutPreference(preferences.feedLayoutPreference ?? 'auto')
    setFeedDescriptionFontScale(
      clampFeedDescriptionFontScale(preferences.feedDescriptionFontScale ?? 1)
    )
    setOpenArticleInReader(preferences.openArticleInReader !== false)
    setFeedColumnCompactImageCrop(preferences.feedColumnCompactImageCrop === true)

    const loadedTabs = loadTabs()
    setTabs(loadedTabs)
    
    // Try to get active tab from URL query string first
    // URL now contains tab name instead of tab ID
    const urlParams = new URLSearchParams(window.location.search)
    const tabNameFromUrl = urlParams.get('tab')
    
    let currentActiveTabId = null
    
    // If tab name in URL, decode it and find the matching tab
    if (tabNameFromUrl) {
      try {
        const decodedTabName = decodeURIComponent(tabNameFromUrl)
        // Find tab by name (if multiple tabs have same name, use first match)
        const matchingTab = loadedTabs.find(t => t.name === decodedTabName)
        if (matchingTab) {
          currentActiveTabId = matchingTab.id
        }
      } catch (e) {
        // Silently handle decode errors
      }
    }
    
    // Fallback to localStorage (with validation) if URL didn't have a valid tab
    if (!currentActiveTabId) {
      const storedTabId = getActiveTabId(loadedTabs)
      currentActiveTabId = storedTabId
      if (!currentActiveTabId) {
        currentActiveTabId = loadedTabs[0]?.id || null
      }
      
      // Update URL with tab name if we're using a different tab than what's in the URL
      if (currentActiveTabId) {
        const currentTab = loadedTabs.find(t => t.id === currentActiveTabId)
        const currentTabName = currentTab?.name
        if (currentTabName && tabNameFromUrl !== encodeURIComponent(currentTabName)) {
          const url = new URL(window.location.href)
          url.searchParams.set('tab', encodeURIComponent(currentTabName))
          window.history.replaceState({}, '', url.toString())
        }
      }
    }
    
    if (currentActiveTabId) {
      setActiveTabId(currentActiveTabId)
      setActiveTabIdState(currentActiveTabId)
    }

    try {
      if (typeof localStorage !== 'undefined' && localStorage.getItem('newsfeed-global-feed-migrated') !== '1') {
        const legacy = currentActiveTabId ? getTabFilters(currentActiveTabId) : null
        if (legacy) {
          saveSettingsPreferences({
            feedGlobalFilters: {
              ...defaultGlobalFeedFilters(),
              newsFilter: legacy.newsFilter || 'all',
              selectedCategories: Array.isArray(legacy.selectedCategories) ? legacy.selectedCategories : [],
              sortBy: legacy.sortBy || 'date',
              showHighlyRated: !!legacy.showHighlyRated,
              searchQuery: typeof legacy.searchQuery === 'string' ? legacy.searchQuery : '',
              sourceNameFilter: typeof legacy.sourceNameFilter === 'string' ? legacy.sourceNameFilter : '',
              minPopularityScore:
                typeof legacy.minPopularityScore === 'number' && legacy.minPopularityScore > 0
                  ? Math.min(99, Math.floor(legacy.minPopularityScore))
                  : null,
            },
          })
        }
        localStorage.setItem('newsfeed-global-feed-migrated', '1')
      }
    } catch {
      /* ignore */
    }

    const prefsAfter = loadSettingsPreferences()
    const gf = prefsAfter.feedGlobalFilters || defaultGlobalFeedFilters()
    setNewsFilter(gf.newsFilter || 'all')
    setSelectedCategories(new Set(gf.selectedCategories || []))
    setSortBy(gf.sortBy || 'date')
    setShowHighlyRated(!!gf.showHighlyRated)
    setSearchQuery(typeof gf.searchQuery === 'string' ? gf.searchQuery : '')
    setSourceNameFilter(typeof gf.sourceNameFilter === 'string' ? gf.sourceNameFilter : '')
    const minG = gf.minPopularityScore
    setMinPopularityScore(
      typeof minG === 'number' && minG > 0 && Number.isFinite(minG) ? Math.min(99, Math.floor(minG)) : null
    )
  }, [])

  // Apply localStorage + URL before leaving Settings so the feed's first paint matches saved sources
  // (avoids useNews mounting with stale App tabs and firing a full fetch for the old list)
  const syncFeedStateAfterSettingsClose = useCallback(() => {
    const reloadedTabs = loadTabs()

    const preferences = loadSettingsPreferences()
    setShowToastMessages(
      preferences.showToastMessages !== undefined ? preferences.showToastMessages : true
    )
    setMobileHeaderCompactToolbar(preferences.mobileHeaderCompactToolbar)
    setFeedHeaderWebShrunk(preferences.feedHeaderWebShrunk)
    setFeedLayoutPreference(preferences.feedLayoutPreference ?? 'auto')
    setFeedDescriptionFontScale(
      clampFeedDescriptionFontScale(preferences.feedDescriptionFontScale ?? 1)
    )
    setOpenArticleInReader(preferences.openArticleInReader !== false)
    setFeedColumnCompactImageCrop(preferences.feedColumnCompactImageCrop === true)

    const urlParams = new URLSearchParams(window.location.search)
    const tabNameFromUrl = urlParams.get('tab')
    let tabIdToUse = null

    if (tabNameFromUrl) {
      try {
        const decodedTabName = decodeURIComponent(tabNameFromUrl)
        const matchingTab = reloadedTabs.find((t) => t.name === decodedTabName)
        if (matchingTab) {
          tabIdToUse = matchingTab.id
        }
      } catch (e) {
        console.warn('[App] Failed to decode tab name from URL:', e)
      }
    }

    if (!tabIdToUse) {
      tabIdToUse = getActiveTabId(reloadedTabs)
    }
    if (!tabIdToUse && reloadedTabs.length > 0) {
      tabIdToUse = reloadedTabs[0]?.id || null
    }

    const newTabsArray = reloadedTabs.map((tab) => ({
      ...tab,
      sources: [...(tab.sources || [])],
    }))
    setTabs(newTabsArray)

    if (tabIdToUse) {
      setActiveTabId(tabIdToUse)
      setActiveTabIdState(tabIdToUse)
    }
  }, [])

  const handleCloseSettings = useCallback(() => {
    syncFeedStateAfterSettingsClose()
    setShowSettings(false)
  }, [syncFeedStateAfterSettingsClose])

  // Helper function to get tab name from tab ID
  const getTabNameFromId = useCallback((tabId) => {
    const tab = tabs.find(t => t.id === tabId)
    return tab?.name || null
  }, [tabs])

  // Helper function to update URL with tab name (instead of tab ID)
  const updateUrlWithTab = useCallback((tabId) => {
    const url = new URL(window.location.href)
    if (tabId) {
      const tabName = getTabNameFromId(tabId)
      if (tabName) {
        // URL-encode the tab name to handle spaces and special characters
        url.searchParams.set('tab', encodeURIComponent(tabName))
      } else {
        // Fallback to ID if name not found (shouldn't happen, but safety check)
        url.searchParams.set('tab', tabId)
      }
    } else {
      url.searchParams.delete('tab')
    }
    // Update URL without page reload
    window.history.replaceState({}, '', url.toString())
  }, [getTabNameFromId])

  // Shared feed filters (all tabs)
  useEffect(() => {
    saveSettingsPreferences({
      feedGlobalFilters: {
        newsFilter,
        selectedCategories: Array.from(selectedCategories),
        sortBy,
        showHighlyRated,
        searchQuery,
        sourceNameFilter,
        minPopularityScore,
      },
    })
  }, [
    newsFilter,
    selectedCategories,
    sortBy,
    showHighlyRated,
    searchQuery,
    sourceNameFilter,
    minPopularityScore,
  ])

  // Handle tab change (filters stay shared across tabs)
  const handleTabChange = (tabId) => {
    setFeedView('feed')
    setActiveTabIdState(tabId)
    setActiveTabId(tabId)
    updateUrlWithTab(tabId)
  }

  // Handle tab rename
  const handleTabRename = useCallback((tabId, newName) => {
    const updatedTabs = updateTabName(tabs, tabId, newName)
    saveTabs(updatedTabs)
    
    // Update local state
    setTabs(updatedTabs.map(tab => ({ ...tab, sources: [...(tab.sources || [])] })))
    
    // If the renamed tab is the active tab, update the URL
    if (tabId === activeTabId) {
      updateUrlWithTab(tabId)
    }
  }, [tabs, activeTabId, updateUrlWithTab])

  // Custom hooks - pass active tab sources and tabId to useNews
  // Use useMemo to ensure tabSources updates when tabs change
  // Create a new array reference to ensure React detects changes
  const tabSources = useMemo(() => {
    const activeTab = tabs.find(t => t.id === activeTabId)
    const sources = activeTab?.sources || []
    // Always return a new array to ensure React detects changes
    return [...sources]
  }, [tabs, activeTabId])
  
  const {
    news,
    newsByTabId,
    loading,
    error,
    feedFetchHadFailures,
    newItemIds,
    fetchNews,
    refreshNews,
  } = useMultiTabNews(tabs, activeTabId, showToastMessages)
  
  // Store refreshNews in a ref so it's available in the Settings onClose callback
  const refreshNewsRef = useRef(refreshNews)
  useEffect(() => {
    refreshNewsRef.current = refreshNews
  }, [refreshNews])
  const allNewsUnion = useMemo(
    () => (tabs || []).flatMap((t) => newsByTabId[t.id] ?? []),
    [tabs, newsByTabId]
  )
  const categories = useCategories(allNewsUnion)

  useEffect(() => {
    tourStepRef.current = tourStepIndex
  }, [tourStepIndex])

  useEffect(() => {
    if (!guidedTourActive) return
    if (tourStepIndex !== 2 || feedView !== 'feed') return
    setSubheaderCollapsed((prev) => {
      if (!prev) return prev
      saveSettingsPreferences({ subheaderCollapsed: false })
      return false
    })
  }, [guidedTourActive, tourStepIndex, feedView])

  // Auto-refresh every 5 minutes (all tabs)
  useEffect(() => {
    if (!autoRefresh) return

    const interval = setInterval(() => {
      refreshNewsRef.current()
    }, 5 * 60 * 1000)

    return () => clearInterval(interval)
  }, [autoRefresh])

  // Get combined categories
  const combinedCategories = getCombinedCategories(categories)

  // Filter and sort news
  const filters = {
    newsFilter,
    showHighlyRated,
    searchQuery,
    selectedCategories,
    sourceNameFilter,
    minPopularityScore,
  }
  
  const filteredNews = filterNews(news, filters, combinedCategories)
  const sortedNews = sortNews(filteredNews, sortBy)

  const tabCountsByTabId = useMemo(() => {
    const out = {}
    for (const tab of tabs) {
      const raw = newsByTabId[tab.id] ?? []
      out[tab.id] = sortNews(filterNews(raw, filters, combinedCategories), sortBy).length
    }
    return out
  }, [tabs, newsByTabId, filters, combinedCategories, sortBy])

  const savedNewsItems = useMemo(
    () => readLaterItems.map(savedArticleToNewsItem),
    [readLaterItems]
  )
  const filteredSavedNews = useMemo(
    () => filterNews(savedNewsItems, filters, combinedCategories),
    [savedNewsItems, filters, combinedCategories]
  )
  const sortedSavedNews = useMemo(() => sortNews(filteredSavedNews, sortBy), [filteredSavedNews, sortBy])

  const listNews = feedView === 'saved' ? sortedSavedNews : sortedNews

  /** Active tab pill: same filtered count as tab strip; omit while loading with no data; never 0. */
  const headerActiveTabArticleCount = useMemo(() => {
    if (feedView === 'saved') {
      return listNews.length > 0 ? listNews.length : undefined
    }
    const c = activeTabId ? tabCountsByTabId[activeTabId] : undefined
    if (c === undefined) return undefined
    if (loading && c === 0) return undefined
    return c > 0 ? c : undefined
  }, [feedView, listNews.length, loading, activeTabId, tabCountsByTabId])

  const feedTabCountAriaLabel = useCallback(
    (tabName, count) => {
      const t = translations[uiLanguage]
      const unit = count === 1 ? t.articleCount : t.articlesCount
      return `${tabName}, ${count} ${unit}`
    },
    [uiLanguage]
  )

  const expandableDescCount = useMemo(
    () => countExpandableDescriptionItems(listNews),
    [listNews]
  )

  const resolvedFeedLayout = useMemo(
    () => resolveFeedLayout(feedLayoutPreference, viewportWidth),
    [feedLayoutPreference, viewportWidth]
  )

  const handleFeedLayoutPreferenceChange = useCallback((value) => {
    const next =
      value === 'list' || value === 'columns2' || value === 'columns3' || value === 'auto'
        ? value
        : 'auto'
    setFeedLayoutPreference(next)
    saveSettingsPreferences({ feedLayoutPreference: next })
  }, [])

  const handleDescriptionFontSmaller = useCallback(() => {
    setFeedDescriptionFontScale((prev) => {
      const n = clampFeedDescriptionFontScale(prev - FEED_DESC_FONT_SCALE_STEP)
      saveSettingsPreferences({ feedDescriptionFontScale: n })
      return n
    })
  }, [])

  const handleDescriptionFontLarger = useCallback(() => {
    setFeedDescriptionFontScale((prev) => {
      const n = clampFeedDescriptionFontScale(prev + FEED_DESC_FONT_SCALE_STEP)
      saveSettingsPreferences({ feedDescriptionFontScale: n })
      return n
    })
  }, [])

  const toggleDescriptionsBulk = useCallback(() => {
    setDescBulkExpanded((prev) => {
      const next = !prev
      setDescExpandAllSignal((s) => ({ nonce: s.nonce + 1, expanded: next }))
      return next
    })
  }, [])

  useEffect(() => {
    if (showSplash) return undefined
    if (guidedTourActive) return undefined

    const onKey = (e) => {
      if (e.defaultPrevented) return
      if (e.ctrlKey || e.metaKey || e.altKey) return

      const isHelpKey = e.key === '?' || (e.shiftKey && e.key === '/')

      if (e.key === 'F1') {
        e.preventDefault()
        setShowHelp(true)
        return
      }

      const k = e.key.length === 1 ? e.key.toLowerCase() : ''
      if (k === 'a' && !isTypingInField(e.target)) {
        e.preventDefault()
        setShowHelp(false)
        setShowSettings(false)
        setArticleReaderItem(null)
        setFeedView('feed')
        scrollToTop()
        return
      }

      if (showHelp) return
      // Settings: help + theme shortcuts only; other feed keys stay disabled below
      if (showSettings) {
        if (isTypingInField(e.target)) return
        if (isHelpKey) {
          e.preventDefault()
          setShowHelp(true)
          return
        }
        if (k === 'l') {
          e.preventDefault()
          setColorMode('light')
          saveSettingsPreferences({ theme: 'light' })
          return
        }
        if (k === 'n') {
          e.preventDefault()
          setColorMode('dark')
          saveSettingsPreferences({ theme: 'dark' })
          return
        }
        return
      }

      if (articleReaderItem) {
        if (isHelpKey && !isTypingInField(e.target)) {
          e.preventDefault()
          setShowHelp(true)
          return
        }
        if (isPlusKey(e)) {
          e.preventDefault()
          handleDescriptionFontLarger()
          return
        }
        if (isMinusKey(e)) {
          e.preventDefault()
          handleDescriptionFontSmaller()
          return
        }
        return
      }

      if (isTypingInField(e.target)) return

      if (e.key === 'Escape' && feedView === 'feed') {
        e.preventDefault()
        setSelectedCategories(new Set())
        setNewsFilter('all')
        setShowHighlyRated(false)
        setSearchQuery('')
        setSourceNameFilter('')
        setMinPopularityScore(null)
        setSortBy('date')
        return
      }

      if (isHelpKey) {
        e.preventDefault()
        setShowHelp(true)
        return
      }

      if (isPlusKey(e)) {
        e.preventDefault()
        handleDescriptionFontLarger()
        return
      }
      if (isMinusKey(e)) {
        e.preventDefault()
        handleDescriptionFontSmaller()
        return
      }

      if (k === 'e' && expandableDescCount >= 2) {
        e.preventDefault()
        toggleDescriptionsBulk()
        return
      }

      if (k === 'f') {
        e.preventDefault()
        setFeedView('feed')
        setSubheaderCollapsed((prev) => {
          const next = !prev
          saveSettingsPreferences({ subheaderCollapsed: next })
          if (!next) {
            window.requestAnimationFrame(() => {
              document.getElementById('feed-search-input')?.focus()
            })
          }
          return next
        })
        return
      }

      if (k === 's') {
        e.preventDefault()
        setFeedView('saved')
        scrollToTop()
        return
      }

      if (k === 't') {
        e.preventDefault()
        const nextId = getNextTabIdCyclic()
        if (nextId) handleTabChange(nextId)
        return
      }

      if (k === 'l') {
        e.preventDefault()
        setColorMode('light')
        saveSettingsPreferences({ theme: 'light' })
        return
      }

      if (k === 'n') {
        e.preventDefault()
        setColorMode('dark')
        saveSettingsPreferences({ theme: 'dark' })
        return
      }

      if (k === 'v') {
        e.preventDefault()
        const resolved = resolveFeedLayout(feedLayoutPreference, viewportWidth)
        const cycle = ['list', 'columns2', 'columns3']
        const idx = cycle.indexOf(resolved)
        const i = idx >= 0 ? idx : 0
        const next = cycle[(i + 1) % cycle.length]
        setFeedLayoutPreference(next)
        saveSettingsPreferences({ feedLayoutPreference: next })
        return
      }

      if (k === 'i') {
        e.preventDefault()
        setFeedColumnCompactImageCrop((prev) => {
          const next = !prev
          saveSettingsPreferences({ feedColumnCompactImageCrop: next })
          return next
        })
        return
      }

      if (k === 'c') {
        e.preventDefault()
        setArticleReaderItem(null)
        setShowSettings(true)
        return
      }

      if (k === 'h' && isWideFeedHeaderLayout) {
        e.preventDefault()
        const next = !feedHeaderWebShrunk
        setFeedHeaderWebShrunk(next)
        saveSettingsPreferences({ feedHeaderWebShrunk: next })
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    showSplash,
    guidedTourActive,
    showHelp,
    showSettings,
    articleReaderItem,
    feedLayoutPreference,
    feedHeaderWebShrunk,
    isWideFeedHeaderLayout,
    handleDescriptionFontLarger,
    handleDescriptionFontSmaller,
    scrollToTop,
    expandableDescCount,
    toggleDescriptionsBulk,
    viewportWidth,
    feedView,
  ])

  const fontScaleAtMin = feedDescriptionFontScale <= FEED_DESC_FONT_SCALE_MIN + 1e-6
  const fontScaleAtMax = feedDescriptionFontScale >= FEED_DESC_FONT_SCALE_MAX - 1e-6

  useEffect(() => {
    setDescBulkExpanded(false)
    setDescExpandAllSignal((s) => ({ nonce: s.nonce + 1, expanded: false }))
  }, [activeTabId, feedView])

  useEffect(() => {
    if (expandableDescCount < 2) setDescBulkExpanded(false)
  }, [expandableDescCount])

  // Categories from all tabs’ articles so filters apply consistently when switching tabs
  const availableCategories = getAvailableCategories(
    feedView === 'saved' ? savedNewsItems : allNewsUnion,
    combinedCategories,
    filters
  )

  const savedArticleIds = useMemo(
    () => new Set(readLaterItems.map((i) => i.id)),
    [readLaterItems]
  )

  const handleFeedOrSavedRefresh = useCallback(() => {
    if (feedView === 'saved') {
      reloadReadLater()
    } else {
      refreshNews()
    }
  }, [feedView, reloadReadLater, refreshNews])

  // Toggle category selection
  const toggleCategory = (categoryName) => {
    setSelectedCategories(prev => {
      const newSet = new Set(prev)
      if (newSet.has(categoryName)) {
        newSet.delete(categoryName)
      } else {
        newSet.add(categoryName)
      }
      return newSet
    })
  }

  // Clear all categories
  const clearCategories = () => {
    setSelectedCategories(new Set())
  }

  // Clear all filters
  const clearAllFilters = () => {
    setSelectedCategories(new Set())
    setNewsFilter('all')
    setShowHighlyRated(false)
    setSearchQuery('')
    setSourceNameFilter('')
    setMinPopularityScore(null)
    setSortBy('date')
  }

  const handleArticleMetaFilter = useCallback((kind, value) => {
    scrollToTop()
    if (kind === 'language' && (value === 'en' || value === 'fr')) {
      setNewsFilter((prev) => (prev === value ? 'all' : value))
      return
    }
    if (kind === 'source') {
      const next = String(value || '').trim()
      setSourceNameFilter((prev) => (prev.trim() === next ? '' : next))
      setSearchQuery('')
      return
    }
    if (kind === 'category') {
      toggleCategory(value)
      return
    }
    if (kind === 'minPopularity') {
      const n = Math.floor(Number(value))
      if (!Number.isFinite(n) || n <= 0) return
      const clamped = Math.min(99, n)
      setMinPopularityScore((prev) => (prev === clamped ? null : clamped))
    }
  }, [scrollToTop, toggleCategory])

  const hasNarrowingFilters = useMemo(
    () =>
      newsFilter !== 'all' ||
      searchQuery.trim().length > 0 ||
      sortBy !== 'date' ||
      showHighlyRated ||
      selectedCategories.size > 0 ||
      sourceNameFilter.trim().length > 0 ||
      minPopularityScore != null,
    [
      newsFilter,
      searchQuery,
      sortBy,
      showHighlyRated,
      selectedCategories,
      sourceNameFilter,
      minPopularityScore,
    ]
  )

  const filtersNudgeActive = useMemo(() => {
    if (feedView !== 'feed') return false
    if (!hasNarrowingFilters) return false
    const hasRaw = tabs.some(
      (t) => (t.sources || []).length > 0 && (newsByTabId[t.id] ?? []).length > 0
    )
    if (!hasRaw) return false
    const tabsWithSrc = tabs.filter((t) => (t.sources || []).length > 0)
    if (!tabsWithSrc.length) return false
    return tabsWithSrc.every((t) => (tabCountsByTabId[t.id] ?? 0) === 0)
  }, [feedView, hasNarrowingFilters, tabs, newsByTabId, tabCountsByTabId])

  const articleFilterActive = useMemo(
    () => ({
      newsFilter,
      sourceTrim: sourceNameFilter.trim(),
      minPopularityScore,
      selectedCategoryKeys: Array.from(selectedCategories),
    }),
    [newsFilter, sourceNameFilter, minPopularityScore, selectedCategories]
  )

  const dismissSplash = useCallback(() => {
    setShowSplash(false)
  }, [])

  useEffect(() => {
    if (showSplash) return
    if (isWelcomeTourCompleted()) return
    setShowWelcomeModal(true)
  }, [showSplash])

  const handleWelcomePickLanguage = useCallback((lang) => {
    const next = lang === 'fr' ? 'fr' : 'en'
    setUiLanguage(next)
    saveSettingsPreferences({ uiLanguage: next })
  }, [])

  const handleWelcomeSkip = useCallback(() => {
    markWelcomeTourCompleted()
    setShowWelcomeModal(false)
  }, [])

  const handleWelcomeStartTour = useCallback(() => {
    setShowWelcomeModal(false)
    setTourStepIndex(0)
    setGuidedTourActive(true)
  }, [])

  const handleStartGuidedTourFromHelp = useCallback(() => {
    setShowHelp(false)
    setHelpFocusSectionId(null)
    setShowWelcomeModal(false)
    if (showSettings) {
      syncFeedStateAfterSettingsClose()
      setShowSettings(false)
    }
    setFeedView('feed')
    setTourStepIndex(0)
    setGuidedTourActive(true)
  }, [showSettings, syncFeedStateAfterSettingsClose])

  const handleTourSkip = useCallback(() => {
    setShowHelp(false)
    setHelpFocusSectionId(null)
    if (showSettings) {
      syncFeedStateAfterSettingsClose()
      setShowSettings(false)
    }
    markWelcomeTourCompleted()
    setGuidedTourActive(false)
    setTourStepIndex(0)
  }, [showSettings, syncFeedStateAfterSettingsClose])

  const handleTourNext = useCallback(() => {
    const s = tourStepRef.current
    const max = GUIDED_TOUR_STEP_COUNT - 1

    if (s === 4) {
      setTourStepIndex(5)
      return
    }
    if (s === 5) {
      setShowSettings(true)
      setTourStepIndex(6)
      return
    }
    if (s === 11) {
      syncFeedStateAfterSettingsClose()
      setShowSettings(false)
      setFeedView('feed')
      scrollToTop()
      markWelcomeTourCompleted()
      setGuidedTourActive(false)
      setTourStepIndex(0)
      return
    }
    if (s >= max) {
      markWelcomeTourCompleted()
      setGuidedTourActive(false)
      setTourStepIndex(0)
      return
    }
    setTourStepIndex(s + 1)
  }, [syncFeedStateAfterSettingsClose, scrollToTop])

  const handleTourBack = useCallback(() => {
    const s = tourStepRef.current
    if (s <= 0) return
    if (s === 4) {
      setTourStepIndex(3)
      return
    }
    if (s === 5) {
      setTourStepIndex(4)
      return
    }
    if (s === 6) {
      syncFeedStateAfterSettingsClose()
      setShowSettings(false)
      setTourStepIndex(5)
      return
    }
    setTourStepIndex(s - 1)
  }, [syncFeedStateAfterSettingsClose])

  // Show Splash Screen on first load (never mounted if splash already completed — see useState init)
  if (showSplash) {
    return <SplashScreen onComplete={dismissSplash} />
  }

  // Show Settings as full page
  if (showSettings) {
    return (
      <div className="app">
        <Settings
          uiLanguage={uiLanguage}
          onClose={handleCloseSettings}
          colorMode={colorMode}
          onColorModeToggle={toggleColorMode}
          onLanguageToggle={handleUiLanguageToggle}
          onExitSettings={handleCloseSettings}
          guidedTourStep={guidedTourActive ? tourStepIndex : null}
          onHelpClick={() => {
            setHelpFocusSectionId(null)
            setShowHelp(true)
          }}
          onHelpManualRssClick={() => {
            setHelpFocusSectionId('help-manual-rss')
            setShowHelp(true)
          }}
          mobileCompactToolbar={mobileHeaderCompactToolbar}
          onMobileCompactToolbarChange={(next) => {
            setMobileHeaderCompactToolbar(next)
            saveSettingsPreferences({ mobileHeaderCompactToolbar: next })
          }}
        />
        <HelpModal
          open={showHelp}
          onClose={() => {
            setShowHelp(false)
            setHelpFocusSectionId(null)
          }}
          uiLanguage={uiLanguage}
          settingsOnly
          focusSectionId={helpFocusSectionId}
          onStartGuidedTour={handleStartGuidedTourFromHelp}
        />
        <GuidedTourOverlay
          open={guidedTourActive}
          stepIndex={tourStepIndex}
          uiLanguage={uiLanguage}
          onNext={handleTourNext}
          onBack={handleTourBack}
          onSkip={handleTourSkip}
        />
      </div>
    )
  }

  // Main News Feed page
  return (
    <div className="app">
        <div className="feed-chrome">
          {showAppStoreIosBanner ? (
            <AppStoreIosBanner
              uiLanguage={uiLanguage}
              visible
              onDismiss={() => {
                persistAppStoreBannerDismissed()
                setAppStoreBannerDismissed(true)
              }}
            />
          ) : null}
          <Header
            uiLanguage={uiLanguage}
            onLanguageToggle={handleUiLanguageToggle}
            onSettingsClick={() => {
              setArticleReaderItem(null)
              setShowSettings(true)
            }}
            isSettingsPage={false}
            onTitleClick={handleTitleClick}
            savedArticlesCount={readLaterItems.length}
            isSavedArticlesView={feedView === 'saved'}
            onSavedArticlesClick={handleSavedArticlesNav}
            colorMode={colorMode}
            onColorModeToggle={toggleColorMode}
            filtersCollapsed={subheaderCollapsed}
            onToggleFilters={() => {
              const newState = !subheaderCollapsed
              setSubheaderCollapsed(newState)
              saveSettingsPreferences({ subheaderCollapsed: newState })
            }}
            showDescriptionsBulkToggle={expandableDescCount >= 2}
            descriptionsBulkExpanded={descBulkExpanded}
            onToggleDescriptionsBulk={toggleDescriptionsBulk}
            onHelpClick={() => {
              setHelpFocusSectionId(null)
              setShowHelp(true)
            }}
            mobileCompactToolbar={mobileHeaderCompactToolbar}
            onMobileCompactToolbarChange={(next) => {
              setMobileHeaderCompactToolbar(next)
              saveSettingsPreferences({ mobileHeaderCompactToolbar: next })
            }}
            webFeedHeaderShrunk={feedHeaderWebShrunk}
            onWebFeedHeaderShrunkChange={(next) => {
              setFeedHeaderWebShrunk(next)
              saveSettingsPreferences({ feedHeaderWebShrunk: next })
            }}
            feedLayoutPreference={feedLayoutPreference}
            onFeedLayoutPreferenceChange={handleFeedLayoutPreferenceChange}
            resolvedFeedLayout={resolvedFeedLayout}
            onDescriptionFontSmaller={handleDescriptionFontSmaller}
            onDescriptionFontLarger={handleDescriptionFontLarger}
            fontScaleAtMin={fontScaleAtMin}
            fontScaleAtMax={fontScaleAtMax}
            narrowingFiltersActive={hasNarrowingFilters}
            nudgeFiltersButton={filtersNudgeActive}
            showAppStoreDesktopButton={showAppStoreDesktopPromo}
            onAppStoreDesktopClick={() => setAppStoreQrModalOpen(true)}
            tourHelpMenuOpen={guidedTourActive ? tourStepIndex === 4 : undefined}
            onGuidedTourClick={handleStartGuidedTourFromHelp}
            headerTabsSlot={
              tabs.length > 1 ? (
                <TabNavigation
                  tabs={tabs}
                  activeTabId={activeTabId}
                  onTabClick={handleTabChange}
                  onTabRename={handleTabRename}
                  activeTabArticleCount={headerActiveTabArticleCount}
                  activeTabCountAriaLabel={feedTabCountAriaLabel}
                  tabCountsById={tabCountsByTabId}
                />
              ) : (
                <span className="header-feed-tab-placeholder" aria-hidden />
              )
            }
          />
          <SubHeader
            uiLanguage={uiLanguage}
            newsFilter={newsFilter}
            onNewsFilterChange={setNewsFilter}
            selectedCategories={selectedCategories}
            availableCategories={availableCategories}
            onToggleCategory={toggleCategory}
            onClearCategories={clearCategories}
            onClearAllFilters={clearAllFilters}
            sortBy={sortBy}
            onSortChange={setSortBy}
            showHighlyRated={showHighlyRated}
            onHighlyRatedToggle={() => setShowHighlyRated(!showHighlyRated)}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            sourceNameFilter={sourceNameFilter}
            minPopularityScore={minPopularityScore}
            onClearSourceFilter={() => setSourceNameFilter('')}
            onClearMinRankFilter={() => setMinPopularityScore(null)}
            onRefresh={handleFeedOrSavedRefresh}
            loading={feedView === 'saved' ? false : loading}
            autoRefresh={autoRefresh}
            onAutoRefreshChange={setAutoRefresh}
            collapsed={subheaderCollapsed}
            feedView={feedView}
            hasActiveArticleFilters={hasNarrowingFilters}
          />
        </div>

        <main className="main">
          <NewsList
            news={listNews}
            uiLanguage={uiLanguage}
            loading={feedView === 'saved' ? false : loading}
            error={feedView === 'saved' ? null : error}
            feedUnavailableEmpty={
              feedView === 'feed' && news.length === 0 && feedFetchHadFailures
            }
            newItemIds={feedView === 'saved' ? emptyNewItemIds : newItemIds}
            combinedCategories={combinedCategories}
            onCategoryClick={toggleCategory}
            onArticleMetaFilter={handleArticleMetaFilter}
            articleFilterActive={articleFilterActive}
            expandAllSignal={descExpandAllSignal}
            feedLayout={resolvedFeedLayout}
            columnImageCompactCrop={feedColumnCompactImageCrop}
            descriptionFontScale={feedDescriptionFontScale}
            readLaterVariant={feedView === 'saved' ? 'saved' : 'feed'}
            savedArticleIds={savedArticleIds}
            onToggleSavedArticle={handleToggleSavedArticle}
            onRemoveSavedArticle={handleRemoveSavedArticle}
            onOpenArticleReader={
              openArticleInReader ? (item) => setArticleReaderItem(item) : null
            }
          />
        </main>
        <FeedScrollToTopButton
          uiLanguage={uiLanguage}
          onScrollToTop={scrollToTop}
          hidden={!!articleReaderItem}
        />
        {articleReaderItem ? (
          <ArticleReaderModal
            key={articleReaderItem.id || articleReaderItem.link}
            item={articleReaderItem}
            onClose={() => setArticleReaderItem(null)}
            uiLanguage={uiLanguage}
          />
        ) : null}
        <HelpModal
          open={showHelp}
          onClose={() => {
            setShowHelp(false)
            setHelpFocusSectionId(null)
          }}
          uiLanguage={uiLanguage}
          onStartGuidedTour={handleStartGuidedTourFromHelp}
        />
        <AppStoreQrModal
          open={appStoreQrModalOpen}
          onClose={() => setAppStoreQrModalOpen(false)}
          uiLanguage={uiLanguage}
        />
        <WelcomeModal
          open={showWelcomeModal}
          uiLanguage={uiLanguage}
          onPickLanguage={handleWelcomePickLanguage}
          onSkip={handleWelcomeSkip}
          onStartTour={handleWelcomeStartTour}
        />
        <GuidedTourOverlay
          open={guidedTourActive}
          stepIndex={tourStepIndex}
          uiLanguage={uiLanguage}
          onNext={handleTourNext}
          onBack={handleTourBack}
          onSkip={handleTourSkip}
        />
      </div>
  )
}

// Main App component that wraps everything in ToastProvider
function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  )
}

export default App
