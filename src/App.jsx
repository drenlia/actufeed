import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react'
import './App.css'
import { useNews } from './hooks/useNews'
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
import { ToastProvider } from './contexts/ToastContext'
import { loadTabs, getActiveTabId, setActiveTabId, getTabFilters, saveTabFilters, updateTabName, saveTabs } from './utils/tabsStorage'
import { loadSettingsPreferences, saveSettingsPreferences } from './utils/settingsStorage'
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

// Inner App component that uses hooks (must be inside ToastProvider)
function AppContent() {
  const [uiLanguage, setUiLanguage] = useState('en')
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
  const [feedView, setFeedView] = useState('feed')
  const [readLaterItems, setReadLaterItems] = useState(() => loadReadLaterList())
  const viewportWidth = useWindowWidth()

  const reloadReadLater = useCallback(() => {
    setReadLaterItems(loadReadLaterList())
  }, [])

  const emptyNewItemIds = useMemo(() => new Set(), [])

  useEffect(() => {
    document.documentElement.dataset.theme = colorMode
  }, [colorMode])

  useEffect(() => {
    if (showSplash) return undefined
    const onKey = (e) => {
      if (e.key === 'F1') {
        e.preventDefault()
        setShowHelp(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showSplash])

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

  // Load tabs on mount and read active tab from URL or localStorage
  useEffect(() => {
    // Load subheader collapsed state and toast messages preference from preferences
    const preferences = loadSettingsPreferences()
    setSubheaderCollapsed(preferences.subheaderCollapsed)
    setShowToastMessages(preferences.showToastMessages !== undefined ? preferences.showToastMessages : false)
    setColorMode(preferences.theme)
    setMobileHeaderCompactToolbar(preferences.mobileHeaderCompactToolbar)
    setFeedHeaderWebShrunk(preferences.feedHeaderWebShrunk)
    setFeedLayoutPreference(preferences.feedLayoutPreference ?? 'auto')
    setFeedDescriptionFontScale(
      clampFeedDescriptionFontScale(preferences.feedDescriptionFontScale ?? 1)
    )

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
    
    // Load filters for active tab
    if (currentActiveTabId) {
      const savedFilters = getTabFilters(currentActiveTabId)
      if (savedFilters) {
        setNewsFilter(savedFilters.newsFilter || 'all')
        setSelectedCategories(new Set(savedFilters.selectedCategories || []))
        setSortBy(savedFilters.sortBy || 'date')
        setShowHighlyRated(savedFilters.showHighlyRated || false)
        setSearchQuery(savedFilters.searchQuery || '')
        setSourceNameFilter(typeof savedFilters.sourceNameFilter === 'string' ? savedFilters.sourceNameFilter : '')
        const minP = savedFilters.minPopularityScore
        setMinPopularityScore(
          typeof minP === 'number' && minP > 0 && Number.isFinite(minP) ? Math.min(99, Math.floor(minP)) : null
        )
      }
    }
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

  // Save filters when they change (per tab)
  useEffect(() => {
    if (activeTabId) {
      saveTabFilters(activeTabId, {
        newsFilter,
        selectedCategories: Array.from(selectedCategories),
        sortBy,
        showHighlyRated,
        searchQuery,
        sourceNameFilter,
        minPopularityScore,
      })
    }
  }, [
    activeTabId,
    newsFilter,
    selectedCategories,
    sortBy,
    showHighlyRated,
    searchQuery,
    sourceNameFilter,
    minPopularityScore,
  ])

  // Handle tab change
  const handleTabChange = (tabId) => {
    setFeedView('feed')
    setActiveTabIdState(tabId)
    setActiveTabId(tabId)
    
    // Update URL with new tab ID
    updateUrlWithTab(tabId)
    
    // Load filters for the new tab
    const savedFilters = getTabFilters(tabId)
    if (savedFilters) {
      setNewsFilter(savedFilters.newsFilter || 'all')
      setSelectedCategories(new Set(savedFilters.selectedCategories || []))
      setSortBy(savedFilters.sortBy || 'date')
      setShowHighlyRated(savedFilters.showHighlyRated || false)
      setSearchQuery(savedFilters.searchQuery || '')
      setSourceNameFilter(typeof savedFilters.sourceNameFilter === 'string' ? savedFilters.sourceNameFilter : '')
      const minP = savedFilters.minPopularityScore
      setMinPopularityScore(
        typeof minP === 'number' && minP > 0 && Number.isFinite(minP) ? Math.min(99, Math.floor(minP)) : null
      )
    } else {
      // Reset to defaults if no saved filters
      setNewsFilter('all')
      setSelectedCategories(new Set())
      setSortBy('date')
      setShowHighlyRated(false)
      setSearchQuery('')
      setSourceNameFilter('')
      setMinPopularityScore(null)
    }
    
    // Force refresh news for the new tab
    // The useNews hook will automatically re-fetch when tabId changes
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
  
  const { news, loading, error, feedFetchHadFailures, newItemIds, fetchNews, refreshNews } = useNews(
    tabSources,
    activeTabId,
    showToastMessages
  )
  
  // Store refreshNews in a ref so it's available in the Settings onClose callback
  const refreshNewsRef = useRef(refreshNews)
  useEffect(() => {
    refreshNewsRef.current = refreshNews
  }, [refreshNews])
  const categories = useCategories(news)

  // Detect browser language on mount
  useEffect(() => {
    const browserLang = navigator.language || navigator.userLanguage
    const detectedLang = browserLang.startsWith('fr') ? 'fr' : 'en'
    setUiLanguage(detectedLang)
  }, [])

  // Auto-refresh every 5 minutes
  const fetchNewsRef = useRef(fetchNews)
  fetchNewsRef.current = fetchNews

  useEffect(() => {
    if (!autoRefresh) return
    
    const interval = setInterval(() => {
      fetchNewsRef.current(false, false) // Background refresh
    }, 5 * 60 * 1000) // 5 minutes
    
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

  /** Match actufeed-app FeedTabStrip: no pill while loading or when count is 0. */
  const headerActiveTabArticleCount = useMemo(() => {
    if (feedView === 'saved') {
      return listNews.length > 0 ? listNews.length : undefined
    }
    if (loading || listNews.length === 0) return undefined
    return listNews.length
  }, [feedView, listNews.length, loading])

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

  const fontScaleAtMin = feedDescriptionFontScale <= FEED_DESC_FONT_SCALE_MIN + 1e-6
  const fontScaleAtMax = feedDescriptionFontScale >= FEED_DESC_FONT_SCALE_MAX - 1e-6

  useEffect(() => {
    setDescBulkExpanded(false)
    setDescExpandAllSignal((s) => ({ nonce: s.nonce + 1, expanded: false }))
  }, [activeTabId, feedView])

  useEffect(() => {
    if (expandableDescCount < 2) setDescBulkExpanded(false)
  }, [expandableDescCount])

  const toggleDescriptionsBulk = useCallback(() => {
    setDescBulkExpanded((prev) => {
      const next = !prev
      setDescExpandAllSignal((s) => ({ nonce: s.nonce + 1, expanded: next }))
      return next
    })
  }, [])

  // Get available categories (only those with matching articles)
  const availableCategories = getAvailableCategories(
    feedView === 'saved' ? savedNewsItems : news,
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
          onLanguageToggle={() => setUiLanguage(uiLanguage === 'fr' ? 'en' : 'fr')}
          onExitSettings={handleCloseSettings}
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
        />
      </div>
    )
  }

  // Main News Feed page
  return (
    <div className="app">
        <div className="feed-chrome">
          <Header
            uiLanguage={uiLanguage}
            onLanguageToggle={() => setUiLanguage(uiLanguage === 'fr' ? 'en' : 'fr')}
            onSettingsClick={() => setShowSettings(true)}
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
            headerTabsSlot={
              tabs.length > 1 ? (
                <TabNavigation
                  tabs={tabs}
                  activeTabId={activeTabId}
                  onTabClick={handleTabChange}
                  onTabRename={handleTabRename}
                  activeTabArticleCount={headerActiveTabArticleCount}
                  activeTabCountAriaLabel={feedTabCountAriaLabel}
                />
              ) : null
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
            descriptionFontScale={feedDescriptionFontScale}
            readLaterVariant={feedView === 'saved' ? 'saved' : 'feed'}
            savedArticleIds={savedArticleIds}
            onToggleSavedArticle={handleToggleSavedArticle}
            onRemoveSavedArticle={handleRemoveSavedArticle}
          />
        </main>
        <HelpModal
          open={showHelp}
          onClose={() => {
            setShowHelp(false)
            setHelpFocusSectionId(null)
          }}
          uiLanguage={uiLanguage}
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
