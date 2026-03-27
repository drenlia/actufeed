import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import './App.css'
import { translations } from './constants/translations'
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
import { ToastProvider } from './contexts/ToastContext'
import { loadTabs, getActiveTabId, setActiveTabId, getTabFilters, saveTabFilters, updateTabName, saveTabs } from './utils/tabsStorage'
import { loadSettingsPreferences, saveSettingsPreferences } from './utils/settingsStorage'
import { countExpandableDescriptionItems } from './utils/newsDescriptionExpand'

// Inner App component that uses hooks (must be inside ToastProvider)
function AppContent() {
  const [uiLanguage, setUiLanguage] = useState('en')
  const [newsFilter, setNewsFilter] = useState('all') // 'all', 'fr', 'en'
  const [selectedCategories, setSelectedCategories] = useState(new Set())
  const [sortBy, setSortBy] = useState('date') // 'date' or 'popularity'
  const [showHighlyRated, setShowHighlyRated] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  const [activeTabId, setActiveTabIdState] = useState(null)
  const [tabs, setTabs] = useState([])
  const [subheaderCollapsed, setSubheaderCollapsed] = useState(
    () => loadSettingsPreferences().subheaderCollapsed
  )
  const [showToastMessages, setShowToastMessages] = useState(false)
  const [showSplash, setShowSplash] = useState(true)
  const [colorMode, setColorMode] = useState(() => loadSettingsPreferences().theme)
  const [descExpandAllSignal, setDescExpandAllSignal] = useState({ nonce: 0, expanded: true })

  useEffect(() => {
    document.documentElement.dataset.theme = colorMode
  }, [colorMode])

  const scrollToTop = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

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
      }
    }
  }, [])
  
  // Track previous showSettings value to detect when it changes from true to false
  const prevShowSettingsRef = useRef(false)
  
  // When Settings closes, read the active tab from URL and navigate to it
  // This ensures the tab selected in Settings is shown on the News Feed page
  useEffect(() => {
    if (prevShowSettingsRef.current === true && showSettings === false) {
      // Settings just closed, reload tabs and read active tab from URL
      const reloadedTabs = loadTabs()
      console.log('[App] Settings closed, reloading tabs. Tabs count:', reloadedTabs.length)
      
      // Reload preferences (including showToastMessages)
      const preferences = loadSettingsPreferences()
      setShowToastMessages(preferences.showToastMessages !== undefined ? preferences.showToastMessages : true)
      
      // Read active tab from URL (Settings updates URL when switching tabs)
      const urlParams = new URLSearchParams(window.location.search)
      const tabNameFromUrl = urlParams.get('tab')
      let tabIdToUse = null
      
      if (tabNameFromUrl) {
        try {
          const decodedTabName = decodeURIComponent(tabNameFromUrl)
          const matchingTab = reloadedTabs.find(t => t.name === decodedTabName)
          if (matchingTab) {
            tabIdToUse = matchingTab.id
            console.log('[App] Using tab from URL (set by Settings):', matchingTab.name, matchingTab.id)
          }
        } catch (e) {
          console.warn('[App] Failed to decode tab name from URL:', e)
        }
      }
      
      // Fallback to localStorage if URL doesn't have a valid tab
      if (!tabIdToUse) {
        tabIdToUse = getActiveTabId(reloadedTabs)
        console.log('[App] Using tab from localStorage:', tabIdToUse)
      }
      
      // Final fallback to first tab
      if (!tabIdToUse && reloadedTabs.length > 0) {
        tabIdToUse = reloadedTabs[0]?.id || null
        console.log('[App] Using first tab as fallback:', tabIdToUse)
      }
      
      // Update tabs and active tab
      const newTabsArray = reloadedTabs.map(tab => ({ ...tab, sources: [...(tab.sources || [])] }))
      setTabs(newTabsArray)
      
      if (tabIdToUse) {
        setActiveTabId(tabIdToUse)
        setActiveTabIdState(tabIdToUse)
      }
    }
    prevShowSettingsRef.current = showSettings
  }, [showSettings])
  
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
        searchQuery
      })
    }
  }, [activeTabId, newsFilter, selectedCategories, sortBy, showHighlyRated, searchQuery])

  // Handle tab change
  const handleTabChange = (tabId) => {
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
    } else {
      // Reset to defaults if no saved filters
      setNewsFilter('all')
      setSelectedCategories(new Set())
      setSortBy('date')
      setShowHighlyRated(false)
      setSearchQuery('')
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
  
  const { news, loading, error, newItemIds, fetchNews, refreshNews } = useNews(tabSources, activeTabId, showToastMessages)
  
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
    selectedCategories
  }
  
  const filteredNews = filterNews(news, filters, combinedCategories)
  const sortedNews = sortNews(filteredNews, sortBy)

  const expandableDescCount = useMemo(
    () => countExpandableDescriptionItems(sortedNews),
    [sortedNews]
  )

  // Get available categories (only those with matching articles)
  const availableCategories = getAvailableCategories(news, combinedCategories, filters)

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
    setSortBy('date')
  }

  const t = translations[uiLanguage]

  // Show Splash Screen on first load
  if (showSplash) {
    return <SplashScreen onComplete={() => setShowSplash(false)} />
  }

  // Show Settings as full page
  if (showSettings) {
    return (
      <div className="app">
        <Header
          uiLanguage={uiLanguage}
          onLanguageToggle={() => setUiLanguage(uiLanguage === 'fr' ? 'en' : 'fr')}
          onSettingsClick={() => setShowSettings(false)}
          showArticleCount={false}
          isSettingsPage={true}
          onTitleClick={() => setShowSettings(false)}
          colorMode={colorMode}
          onColorModeToggle={toggleColorMode}
        />
        <Settings
          uiLanguage={uiLanguage}
          onClose={() => {
            // Simply close Settings - the useEffect will handle reading the tab from URL
            setShowSettings(false)
          }}
        />
      </div>
    )
  }

  // Main News Feed page
  return (
    <div className="app">
        <Header
          uiLanguage={uiLanguage}
          onLanguageToggle={() => setUiLanguage(uiLanguage === 'fr' ? 'en' : 'fr')}
          articleCount={sortedNews.length}
          totalCount={news.length}
          onSettingsClick={() => setShowSettings(true)}
          showArticleCount={true}
          isSettingsPage={false}
          onTitleClick={scrollToTop}
          colorMode={colorMode}
          onColorModeToggle={toggleColorMode}
          filtersCollapsed={subheaderCollapsed}
          onToggleFilters={() => {
            const newState = !subheaderCollapsed
            setSubheaderCollapsed(newState)
            saveSettingsPreferences({ subheaderCollapsed: newState })
          }}
          hasExpandableDescriptions={expandableDescCount > 0}
          onExpandAllDescriptions={() =>
            setDescExpandAllSignal((s) => ({ nonce: s.nonce + 1, expanded: true }))
          }
          onShrinkAllDescriptions={() =>
            setDescExpandAllSignal((s) => ({ nonce: s.nonce + 1, expanded: false }))
          }
        />
        {tabs.length > 1 && (
          <TabNavigation
            tabs={tabs}
            activeTabId={activeTabId}
            onTabClick={handleTabChange}
            onTabRename={handleTabRename}
          />
        )}
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
          onRefresh={refreshNews}
          loading={loading}
          autoRefresh={autoRefresh}
          onAutoRefreshChange={setAutoRefresh}
          collapsed={subheaderCollapsed}
        />

        <main className="main">
          <NewsList
            news={sortedNews}
            uiLanguage={uiLanguage}
            loading={loading}
            error={error}
            newItemIds={newItemIds}
            combinedCategories={combinedCategories}
            onCategoryClick={toggleCategory}
            expandAllSignal={descExpandAllSignal}
          />
        </main>
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
