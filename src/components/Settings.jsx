import { useState, useEffect, useRef, useCallback } from 'react'
import { translations } from '../constants/translations'
import {
  searchSources,
  getAllSources,
  getAllCountries,
  CATALOG_BROWSE_LIMIT,
} from '../services/sourceSearchService'
import { 
  loadNewsConfig, 
  saveNewsConfig, 
  exportConfig,
  importConfig
} from '../utils/newsConfigUtils'
import { loadSettingsPreferences, saveSettingsPreferences } from '../utils/settingsStorage'
import { clearCachedNews } from '../utils/storageUtils'
import { validateRssFeed } from '../utils/rssValidator'
import {
  searchYoutubeChannels,
  YOUTUBE_SEARCH_UNAVAILABLE,
  youtubeChannelPageUrl,
} from '../services/youtubeChannelSearch'
import { useToastContext } from '../contexts/ToastContext'
import { Header } from './Header'
import { TabBar } from './TabBar'
import {
  loadTabs,
  saveTabs,
  createNewTab,
  deleteTab,
  updateTabName,
  updateTabSources,
  reorderTabs,
  getActiveTabId,
  setActiveTabId,
  upsertDefaultTab,
} from '../utils/tabsStorage'
import {
  classifyDefaultTab,
  sourcesForDefaultTab,
  DEFAULT_TAB_NAMES,
  sourcesMatchDefaults,
} from '../constants/defaultSources'

export const Settings = ({
  uiLanguage,
  onClose,
  colorMode,
  onColorModeToggle,
  onLanguageToggle,
  onExitSettings,
  onHelpClick,
  onHelpManualRssClick,
  mobileCompactToolbar = false,
  onMobileCompactToolbarChange,
}) => {
  const t = translations[uiLanguage]
  const [tabs, setTabs] = useState([])
  const [activeTabId, setActiveTabIdState] = useState(null)
  const [config, setConfig] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [selectedAvailableSources, setSelectedAvailableSources] = useState(new Set()) // For "Add Selected" button
  const [selectedActiveSources, setSelectedActiveSources] = useState(new Set()) // For "Remove Selected" button
  const [selectedCountries, setSelectedCountries] = useState(new Set())
  const [availableCountries, setAvailableCountries] = useState([])
  const [countrySearchQuery, setCountrySearchQuery] = useState('')
  const [showToastMessages, setShowToastMessages] = useState(false)
  const searchTimeoutRef = useRef(null)
  const { success, error: showError, warning } = useToastContext()
  
  // Manual RSS feed state
  const [manualFeedUrl, setManualFeedUrl] = useState('')
  const [validatingFeed, setValidatingFeed] = useState(false)
  const [feedValidationResult, setFeedValidationResult] = useState(null)
  const [feedTitle, setFeedTitle] = useState('')

  const [ytQuery, setYtQuery] = useState('')
  const [ytLoading, setYtLoading] = useState(false)
  const [ytResults, setYtResults] = useState([])
  const [ytError, setYtError] = useState(null)

  /** Collapsed by default so the catalog / sources list stays visible above the fold. */
  const [manualFeedExpanded, setManualFeedExpanded] = useState(false)
  const [restoreModal, setRestoreModal] = useState(null)

  // Load tabs and configuration on mount
  useEffect(() => {
    // Load tabs (this will inject default sources if needed)
    const loadedTabs = loadTabs()
    setTabs(loadedTabs)
    
    // Load active tab ID or use first tab
    // When there's only one tab, always use it as active (this is the default tab)
    let currentActiveTabId = null
    if (loadedTabs.length === 1) {
      // Only one tab exists - always use it (this ensures default tab is always selected)
      currentActiveTabId = loadedTabs[0]?.id || null
      if (currentActiveTabId) {
        setActiveTabId(currentActiveTabId)
      }
    } else {
      // Multiple tabs - use stored active tab or first one
      currentActiveTabId = getActiveTabId(loadedTabs)
      if (!currentActiveTabId || !loadedTabs.find(t => t.id === currentActiveTabId)) {
        currentActiveTabId = loadedTabs[0]?.id || null
        if (currentActiveTabId) {
          setActiveTabId(currentActiveTabId)
        }
      }
    }
    setActiveTabIdState(currentActiveTabId)
    
    // Update URL query parameter with active tab name on Settings load
    if (currentActiveTabId) {
      const activeTab = loadedTabs.find(t => t.id === currentActiveTabId)
      if (activeTab?.name) {
        const url = new URL(window.location.href)
        url.searchParams.set('tab', encodeURIComponent(activeTab.name))
        window.history.replaceState({}, '', url.toString())
      }
    }
    
      // Load sources for active tab
      const activeTab = loadedTabs.find(t => t.id === currentActiveTabId)
      const tabSources = activeTab?.sources || []
      
      // Create config from tab sources
      const loadedConfig = { sources: tabSources }
      setConfig(loadedConfig)
      
      // Clear selections when tab changes
      setSelectedAvailableSources(new Set())
      setSelectedActiveSources(new Set())
    
    // Load country filters from storage
    const preferences = loadSettingsPreferences()
    setShowToastMessages(preferences.showToastMessages !== undefined ? preferences.showToastMessages : false)
    setSelectedCountries(preferences.selectedCountries)
    
    // Load available countries
    const countries = getAllCountries()
    setAvailableCountries(countries)
    
    // Load initial available sources (filtered by countries if any selected)
    const initialSources = getAllSources(
      CATALOG_BROWSE_LIMIT,
      preferences.selectedCountries.size > 0 ? preferences.selectedCountries : null
    )
    setSearchResults(initialSources)
  }, [])
  
  // Update config when active tab changes
  useEffect(() => {
    if (activeTabId && tabs.length > 0) {
      const activeTab = tabs.find(t => t.id === activeTabId)
      if (activeTab) {
        const tabConfig = { sources: activeTab.sources || [] }
        setConfig(tabConfig)
        
        // Update URL query parameter when active tab changes
        if (activeTab.name) {
          const url = new URL(window.location.href)
          url.searchParams.set('tab', encodeURIComponent(activeTab.name))
          window.history.replaceState({}, '', url.toString())
        }
        
        // Clear selections when switching tabs
        setSelectedAvailableSources(new Set())
        setSelectedActiveSources(new Set())
      } else {
      }
    }
  }, [activeTabId, tabs])

  // Handle search with debounce and country filters
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    const applyFilters = () => {
      const countryFilters = selectedCountries.size > 0 ? selectedCountries : null

      if (searchQuery.trim().length === 0) {
        // Show initial sources when no search (filtered by countries)
        setSearchResults(getAllSources(CATALOG_BROWSE_LIMIT, countryFilters))
        return
      }

      if (searchQuery.trim().length < 1) {
        setSearchResults([])
        return
      }

      const results = searchSources(searchQuery, countryFilters)
      setSearchResults(results)
    }

    searchTimeoutRef.current = setTimeout(applyFilters, 300)

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [searchQuery, selectedCountries])

  // Get active source URLs for current tab
  const activeSourceUrls = config ? new Set(config.sources.map(s => s.url)) : new Set()
  
  // Get active tab
  const activeTab = tabs.find(t => t.id === activeTabId)

  const closeRestoreModal = useCallback(() => setRestoreModal(null), [])

  useEffect(() => {
    if (!restoreModal) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') setRestoreModal(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [restoreModal])

  const applyUpsertBuiltInTab = useCallback(
    (key) => {
      const norm = (s) =>
        String(s || '')
          .trim()
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
      const displayName = DEFAULT_TAB_NAMES[key]
      const nextSources = sourcesForDefaultTab(key)
      const n = norm(displayName)
      const existing = tabs.find((t) => norm(t.name) === n)
      if (existing && sourcesMatchDefaults(existing.sources, nextSources)) {
        setRestoreModal({ mode: 'already-default' })
        return
      }
      const { nextTabs, targetTabId } = upsertDefaultTab(tabs, displayName, nextSources)
      setTabs(nextTabs)
      saveTabs(nextTabs)
      setActiveTabId(targetTabId)
      setActiveTabIdState(targetTabId)
      clearCachedNews(targetTabId)
      setRestoreModal(null)
      success(t.restoreDefaultsDone)
    },
    [tabs, t, success]
  )

  const executeRestoreCurrentBuiltInTab = useCallback(() => {
    if (!restoreModal || restoreModal.mode !== 'confirm' || !activeTabId || !config) return
    const key = restoreModal.key
    const nextSources = sourcesForDefaultTab(key)
    const updatedTabs = updateTabSources(tabs, activeTabId, nextSources)
    setTabs(updatedTabs)
    saveTabs(updatedTabs)
    setConfig({ ...config, sources: nextSources })
    clearCachedNews(activeTabId)
    setRestoreModal(null)
    success(t.restoreDefaultsDone)
  }, [restoreModal, activeTabId, config, tabs, t, success])

  const openRestoreDefaultSourcesFlow = useCallback(() => {
    if (!activeTabId || !config) return
    const tab = tabs.find((x) => x.id === activeTabId)
    const builtInKey = classifyDefaultTab(tab?.name ?? '')
    if (builtInKey) {
      const nextSources = sourcesForDefaultTab(builtInKey)
      if (sourcesMatchDefaults(tab?.sources, nextSources)) {
        setRestoreModal({ mode: 'already-default' })
        return
      }
      setRestoreModal({ mode: 'confirm', key: builtInKey })
      return
    }
    setRestoreModal({ mode: 'picker' })
  }, [activeTabId, config, tabs])

  // Toggle source selection in available sources list
  const toggleAvailableSourceSelection = (sourceUrl) => {
    setSelectedAvailableSources(prev => {
      const newSet = new Set(prev)
      if (newSet.has(sourceUrl)) {
        newSet.delete(sourceUrl)
      } else {
        newSet.add(sourceUrl)
      }
      return newSet
    })
  }

  // Toggle source selection in active sources list
  const toggleActiveSourceSelection = (sourceUrl) => {
    setSelectedActiveSources(prev => {
      const newSet = new Set(prev)
      if (newSet.has(sourceUrl)) {
        newSet.delete(sourceUrl)
      } else {
        newSet.add(sourceUrl)
      }
      return newSet
    })
  }

  // Select/Deselect all visible results in available sources
  const toggleSelectAll = () => {
    if (selectedAvailableSources.size === searchResults.length) {
      setSelectedAvailableSources(new Set())
    } else {
      setSelectedAvailableSources(new Set(searchResults.map(r => r.url)))
    }
  }

  // Select/Deselect all active sources
  const toggleSelectAllActive = () => {
    if (selectedActiveSources.size === config.sources.length) {
      setSelectedActiveSources(new Set())
    } else {
      setSelectedActiveSources(new Set(config.sources.map(s => s.url)))
    }
  }

  // Toggle country filter
  const toggleCountryFilter = (countryCode) => {
    setSelectedCountries(prev => {
      const newSet = new Set(prev)
      if (newSet.has(countryCode)) {
        newSet.delete(countryCode)
      } else {
        newSet.add(countryCode)
      }
      
      // Save to localStorage
      saveSettingsPreferences({ selectedCountries: newSet })
      
      return newSet
    })
  }

  // Clear all country filters
  const clearCountryFilters = () => {
    setSelectedCountries(new Set())
    saveSettingsPreferences({ selectedCountries: new Set() })
  }

  // Add selected sources to active tab
  const handleAddSelected = () => {
    if (selectedAvailableSources.size === 0 || !activeTabId) return

    const sourcesToAdd = searchResults
      .filter(r => selectedAvailableSources.has(r.url))
      .filter(r => !activeSourceUrls.has(r.url)) // Don't add duplicates
      .map(r => ({
        name: r.name,
        url: r.url,
        language: r.language,
        region: r.region || '',
        country: r.country || '',
        province: r.province || ''
      }))

      if (sourcesToAdd.length === 0) {
        warning('Selected sources are already active')
        return
      }

    const updatedSources = [...config.sources, ...sourcesToAdd]
    const updatedTabs = updateTabSources(tabs, activeTabId, updatedSources)
    setTabs(updatedTabs)
    saveTabs(updatedTabs)
    
    const updatedConfig = { ...config, sources: updatedSources }
    setConfig(updatedConfig)
    clearCachedNews(activeTabId) // Clear cache for this tab to force fresh fetch
    setSelectedAvailableSources(new Set()) // Clear selection after adding
    success(`Added ${sourcesToAdd.length} source(s)`)
  }

  // Remove selected sources from active tab
  const handleRemoveSelected = () => {
    if (selectedActiveSources.size === 0 || !activeTabId) return

    const updatedSources = config.sources.filter(s => !selectedActiveSources.has(s.url))
    const updatedTabs = updateTabSources(tabs, activeTabId, updatedSources)
    setTabs(updatedTabs)
    saveTabs(updatedTabs)
    
    const updatedConfig = { ...config, sources: updatedSources }
    setConfig(updatedConfig)
    clearCachedNews(activeTabId) // Clear cache for this tab when removing sources
    setSelectedActiveSources(new Set()) // Clear selection after removing
    success(`Removed ${config.sources.length - updatedSources.length} source(s)`)
  }

  // Toggle individual source (add/remove) for active tab
  const handleToggleSource = (source) => {
    if (!activeTabId) return
    
    const isActive = activeSourceUrls.has(source.url)
    
    if (isActive) {
      // Remove source - clear cache to remove articles from this source
      const updatedSources = config.sources.filter(s => s.url !== source.url)
      const updatedTabs = updateTabSources(tabs, activeTabId, updatedSources)
      setTabs(updatedTabs)
      saveTabs(updatedTabs)
      
      const updatedConfig = { ...config, sources: updatedSources }
      setConfig(updatedConfig)
      clearCachedNews(activeTabId) // Clear cache for this tab when removing sources
      success('Source removed')
    } else {
      // Add source
      const newSource = {
        name: source.name,
        url: source.url,
        language: source.language,
        region: source.region || '',
        country: source.country || '',
        province: source.province || ''
      }
      const updatedSources = [...config.sources, newSource]
      const updatedTabs = updateTabSources(tabs, activeTabId, updatedSources)
      setTabs(updatedTabs)
      saveTabs(updatedTabs)
      
      const updatedConfig = { ...config, sources: updatedSources }
      setConfig(updatedConfig)
      clearCachedNews(activeTabId) // Clear cache for this tab to force fresh fetch
      success('Source added')
    }
  }

  // Remove single source from active tab
  const handleRemoveSource = (sourceUrl) => {
    if (!activeTabId) return
    
    const updatedSources = config.sources.filter(s => s.url !== sourceUrl)
    const updatedTabs = updateTabSources(tabs, activeTabId, updatedSources)
    setTabs(updatedTabs)
    saveTabs(updatedTabs)
    
    const updatedConfig = { ...config, sources: updatedSources }
    setConfig(updatedConfig)
    clearCachedNews(activeTabId) // Clear cache for this tab when removing sources
    success('Source removed')
  }

  // Copy source URL to clipboard
  const handleCopySourceUrl = async (sourceUrl, sourceName) => {
    try {
      await navigator.clipboard.writeText(sourceUrl)
      success(`Copied ${sourceName} URL to clipboard`)
    } catch (err) {
      // Fallback for older browsers
      try {
        const textArea = document.createElement('textarea')
        textArea.value = sourceUrl
        textArea.style.position = 'fixed'
        textArea.style.opacity = '0'
        document.body.appendChild(textArea)
        textArea.select()
        document.execCommand('copy')
        document.body.removeChild(textArea)
        success(`Copied ${sourceName} URL to clipboard`)
      } catch (fallbackErr) {
        showError('Failed to copy URL to clipboard')
      }
    }
  }

  const handleExport = () => {
    exportConfig(config)
    success('Full backup exported (tabs, settings, and sources)')
  }

  const handleImport = (event) => {
    const file = event.target.files[0]
    if (!file) return

    importConfig(file)
      .then(importedConfig => {
        setConfig(importedConfig)
        saveNewsConfig(importedConfig)
        success('Backup restored successfully. Reloading...')
        setTimeout(() => {
          window.location.reload()
        }, 1000)
      })
      .catch(error => {
        showError(`Import failed: ${error.message}`)
      })
  }

  const applyYoutubeChannel = (hit) => {
    setManualFeedUrl(youtubeChannelPageUrl(hit.channelId))
    setFeedValidationResult(null)
    setFeedTitle('')
    setYtError(null)
  }

  const runYoutubeSearch = async () => {
    const q = ytQuery.trim()
    if (q.length < 2) {
      setYtError(t.youtubeSearchQueryTooShort)
      setYtResults([])
      return
    }
    setYtLoading(true)
    setYtError(null)
    setYtResults([])
    try {
      const { items } = await searchYoutubeChannels(q)
      if (items.length === 0) setYtError(t.youtubeNoResults)
      setYtResults(items)
    } catch (e) {
      if (e.message === YOUTUBE_SEARCH_UNAVAILABLE) {
        setYtError(t.youtubeSearchNotConfigured)
      } else {
        setYtError(t.youtubeSearchFailed)
      }
      setYtResults([])
    } finally {
      setYtLoading(false)
    }
  }

  // Validate manual RSS feed
  const handleValidateFeed = async () => {
    if (!manualFeedUrl.trim()) return
    
    setValidatingFeed(true)
    setFeedValidationResult(null)
    setFeedTitle('') // Reset title when validating new feed
    
    try {
      const result = await validateRssFeed(manualFeedUrl.trim())
      setFeedValidationResult(result)
      // Set initial title from feed validation result
      if (result.valid && result.channel && result.channel.title) {
        setFeedTitle(result.channel.title)
      } else {
        setFeedTitle('')
      }
      if (!result.valid && result.errors && result.errors.length > 0) {
        showError(result.errors[0])
      }
    } catch (error) {
      const errorResult = {
        valid: false,
        errors: [`Validation error: ${error.message}`],
        warnings: []
      }
      setFeedValidationResult(errorResult)
      setFeedTitle('')
      showError(`Validation error: ${error.message}`)
    } finally {
      setValidatingFeed(false)
    }
  }

  // Add validated feed to sources
  const handleAddValidatedFeed = () => {
    if (!feedValidationResult || !feedValidationResult.valid || !feedValidationResult.channel) {
      return
    }
    
    const feedUrl = (feedValidationResult.resolvedFeedUrl || manualFeedUrl).trim()
    const resolved = feedValidationResult.resolvedFeedUrl?.trim()
    const finalTitle = feedTitle.trim() || feedValidationResult.channel.title || 'Untitled Feed'
    
    // Check if feed already exists (compare canonical URL for YouTube)
    if (
      config.sources.some(
        (s) => s.url === feedUrl || (resolved && s.url === resolved)
      )
    ) {
      showError('This feed is already in your sources')
      return
    }
    
    // Create new source from validated feed
    const newSource = {
      name: finalTitle,
      url: feedUrl,
      language: feedValidationResult.channel.language || 'en',
      region: '',
      country: '',
      province: '',
      feedFormat: feedValidationResult.feedFormat === 'atom' ? 'atom' : 'rss2',
    }
    
    if (!activeTabId) {
      showError('No active tab selected')
      return
    }
    
    const updatedSources = [...config.sources, newSource]
    const updatedTabs = updateTabSources(tabs, activeTabId, updatedSources)
    setTabs(updatedTabs)
    saveTabs(updatedTabs)
    
    const updatedConfig = { ...config, sources: updatedSources }
    setConfig(updatedConfig)
    clearCachedNews(activeTabId) // Clear cache for this tab to force fresh fetch
    success(t.feedAdded)
    
    // Clear form
    setManualFeedUrl('')
    setFeedValidationResult(null)
    setFeedTitle('')
  }

  const handleTabRenameForSettings = (tabId, newName) => {
    const updatedTabs = updateTabName(tabs, tabId, newName)
    setTabs(updatedTabs)
    saveTabs(updatedTabs)
    if (activeTabId === tabId) {
      const url = new URL(window.location.href)
      url.searchParams.set('tab', encodeURIComponent(newName))
      window.history.replaceState({}, '', url.toString())
    }
    success('Tab name updated')
  }

  const handleReorderTabs = (fromIndex, toIndex) => {
    const newTabs = reorderTabs(tabs, fromIndex, toIndex)
    setTabs(newTabs)
    saveTabs(newTabs)
  }

  // Tab management functions
  const handleCreateTab = () => {
    const newTab = createNewTab(tabs)
    const updatedTabs = [...tabs, newTab]
    setTabs(updatedTabs)
    saveTabs(updatedTabs)
    setActiveTabIdState(newTab.id)
    setActiveTabId(newTab.id)
    setConfig({ sources: [] })
    
    // Update URL query parameter with new tab name
    const url = new URL(window.location.href)
    url.searchParams.set('tab', encodeURIComponent(newTab.name))
    window.history.replaceState({}, '', url.toString())
    
    success(`Created ${newTab.name}`)
  }

  const handleDeleteTab = (tabId) => {
    if (tabs.length <= 1) {
      warning('Cannot delete the last tab')
      return
    }
    
    const updatedTabs = deleteTab(tabs, tabId)
    setTabs(updatedTabs)
    saveTabs(updatedTabs)
    
    // Switch to first tab if deleted tab was active
    if (activeTabId === tabId) {
      const newActiveId = updatedTabs[0].id
      setActiveTabIdState(newActiveId)
      setActiveTabId(newActiveId)
      
      // Update URL query parameter with the new active tab name
      const newActiveTab = updatedTabs[0]
      if (newActiveTab?.name) {
        const url = new URL(window.location.href)
        url.searchParams.set('tab', encodeURIComponent(newActiveTab.name))
        window.history.replaceState({}, '', url.toString())
      }
    }
    
    success('Tab deleted')
  }

  const handleSwitchTab = (tabId) => {
    setActiveTabIdState(tabId)
    setActiveTabId(tabId)
    
    // Update URL query parameter with tab name for navigation consistency
    const tab = tabs.find(t => t.id === tabId)
    if (tab?.name) {
      const url = new URL(window.location.href)
      url.searchParams.set('tab', encodeURIComponent(tab.name))
      window.history.replaceState({}, '', url.toString())
    }
  }

  if (!config) {
    return <div className="settings-loading">{t.loading}</div>
  }

  const allSelected = searchResults.length > 0 && selectedAvailableSources.size === searchResults.length
  const allActiveSelected = config.sources.length > 0 && selectedActiveSources.size === config.sources.length

  const toggleShowToastMessages = () => {
    const newValue = !showToastMessages
    setShowToastMessages(newValue)
    saveSettingsPreferences({ showToastMessages: newValue })
  }

  return (
    <>
      <div className="settings-chrome">
        <Header
          uiLanguage={uiLanguage}
          onLanguageToggle={onLanguageToggle}
          onSettingsClick={onExitSettings}
          isSettingsPage
          onTitleClick={onExitSettings}
          onHelpClick={onHelpClick}
          colorMode={colorMode}
          onColorModeToggle={onColorModeToggle}
          mobileCompactToolbar={mobileCompactToolbar}
          onMobileCompactToolbarChange={onMobileCompactToolbarChange}
          headerTabsSlot={
            tabs.length > 0 ? (
              <TabBar
                tabs={tabs}
                activeTabId={activeTabId}
                onTabClick={handleSwitchTab}
                onTabRename={handleTabRenameForSettings}
                alwaysShow
                allowDelete
                onTabDelete={handleDeleteTab}
                deleteTabTitle={t.deleteTab}
                allowReorder
                onReorder={handleReorderTabs}
                showCreateButton
                onCreateTab={handleCreateTab}
                createTabLabel={t.createTab}
                tabsListAriaLabel={t.tabsListAria}
                tabSourcesCountAria={(n) => t.settingsTabSourcesCountA11y.replace('{n}', String(n))}
              />
            ) : null
          }
        />
      </div>
      <div className="settings-page">
        <div className="settings-tabs-section">
          <div className="settings-tabs-meta-row">
            <button
              type="button"
              className="settings-restore-defaults-btn"
              onClick={openRestoreDefaultSourcesFlow}
            >
              {t.restoreDefaultSources}
            </button>
            <div className="toast-toggle-container">
              <label className="settings-toast-toggle-label" htmlFor="settings-fetch-toasts-switch">
                {t.showToastMessages || 'Show fetch banners'}
              </label>
              <button
                type="button"
                id="settings-fetch-toasts-switch"
                className={`settings-fetch-toast-switch ${showToastMessages ? 'is-on' : ''}`}
                onClick={toggleShowToastMessages}
                role="switch"
                aria-checked={showToastMessages}
                aria-label={t.showToastMessages || 'Show fetch banners'}
              >
                <span className="settings-fetch-toast-switch-knob" aria-hidden />
              </button>
            </div>
          </div>
        </div>

        <div className="settings-layout">
        {/* Country filters — grid column; on phone: narrow ISO column beside sources */}
        <aside className="settings-sidebar">
          <div className="sidebar-section">
            <h3 className="settings-country-heading">
              <span className="settings-country-heading__full">{t.filterByCountry}</span>
              <span className="settings-country-heading__short">{t.filterByCountryShort}</span>
            </h3>
            <div className="country-search-container">
              <input
                type="text"
                className="country-search-input"
                placeholder={t.searchCountriesPlaceholder}
                value={countrySearchQuery}
                onChange={(e) => setCountrySearchQuery(e.target.value)}
              />
              {countrySearchQuery && (
                <button
                  type="button"
                  className="country-search-clear"
                  onClick={() => setCountrySearchQuery('')}
                  title={t.countrySearchClear}
                >
                  ×
                </button>
              )}
            </div>
            <div className="country-pills-vertical">
              {availableCountries
                .filter(country => {
                  if (!countrySearchQuery.trim()) return true
                  const query = countrySearchQuery.toLowerCase()
                  return country.name.toLowerCase().includes(query) ||
                         country.code.toLowerCase().includes(query)
                })
                .map(country => {
                  const isSelected = selectedCountries.has(country.code)
                  return (
                    <button
                      key={country.code}
                      type="button"
                      className={`country-pill-vertical ${isSelected ? 'selected' : ''}`}
                      onClick={() => toggleCountryFilter(country.code)}
                      title={`${country.name} (${country.count} sources)`}
                    >
                      <span className="country-code">{country.code.toUpperCase()}</span>
                      <span className="country-name">{country.name}</span>
                      <span className="country-count">({country.count})</span>
                    </button>
                  )
                })}
            </div>
            {selectedCountries.size > 0 && (
              <button
                type="button"
                className="clear-country-filters-btn clear-country-filters-btn--after-pills"
                onClick={clearCountryFilters}
              >
                {t.clearFilters}
              </button>
            )}
          </div>
        </aside>

        <div
          className={`settings-manual-panel settings-glass-panel${manualFeedExpanded ? '' : ' settings-manual-panel--add-collapsed'}`}
        >
          <div className="settings-section">
            <div className="settings-manual-feed-heading-row">
              <h2 id="manual-feed-heading" className="settings-manual-feed-title">
                <button
                  type="button"
                  className="settings-manual-feed-disclosure"
                  aria-expanded={manualFeedExpanded}
                  aria-controls="manual-feed-collapsible"
                  title={
                    manualFeedExpanded ? t.manualFeedSectionHideForm : t.manualFeedSectionShowForm
                  }
                  onClick={() => setManualFeedExpanded((v) => !v)}
                >
                  <span
                    className={`settings-manual-feed-chevron${manualFeedExpanded ? ' is-expanded' : ''}`}
                    aria-hidden
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="20"
                      height="20"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M9 6l6 6-6 6"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                  <span className="settings-manual-feed-title__text">{t.addManualFeed}</span>
                </button>
              </h2>
              {onHelpManualRssClick ? (
                <button
                  type="button"
                  className="settings-manual-feed-title__help"
                  onClick={onHelpManualRssClick}
                  aria-label={t.helpManualRssLinkAria}
                  title={t.helpManualRssLinkAria}
                >
                  ?
                </button>
              ) : null}
            </div>
            <div
              id="manual-feed-collapsible"
              role="region"
              aria-labelledby="manual-feed-heading"
              hidden={!manualFeedExpanded}
              className="manual-feed-container"
            >
              <div className="yt-channel-search" aria-labelledby="yt-channel-search-heading">
                <div className="yt-channel-search__header" id="yt-channel-search-heading">
                  <span className="yt-channel-search__icon" aria-hidden>
                    <svg
                      className="yt-channel-search__logo"
                      viewBox="0 0 24 24"
                      width="22"
                      height="22"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <rect width="24" height="24" rx="4" fill="#FF0000" />
                      <path fill="#fff" d="M10 8.5v7l6-3.5-6-3.5z" />
                    </svg>
                  </span>
                  <span className="yt-channel-search__label">{t.youtubeFindChannel}</span>
                </div>
                <div className="yt-channel-search__row">
                  <input
                    type="search"
                    className="yt-channel-search__input"
                    placeholder={t.youtubeSearchPlaceholder}
                    value={ytQuery}
                    onChange={(e) => setYtQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') runYoutubeSearch()
                    }}
                    autoComplete="off"
                    enterKeyHint="search"
                  />
                  <button
                    type="button"
                    className="yt-channel-search__btn"
                    onClick={runYoutubeSearch}
                    disabled={ytLoading}
                  >
                    {ytLoading ? t.youtubeSearching : t.youtubeSearchButton}
                  </button>
                </div>
                {ytError ? (
                  <div className="yt-channel-search__msg yt-channel-search__msg--error" role="alert">
                    {ytError}
                  </div>
                ) : null}
                {ytResults.length > 0 ? (
                  <ul className="yt-channel-search__results" role="listbox" aria-label={t.youtubeFindChannel}>
                    {ytResults.map((hit) => (
                      <li key={hit.channelId}>
                        <button
                          type="button"
                          className="yt-channel-search__hit"
                          onClick={() => applyYoutubeChannel(hit)}
                        >
                          {hit.thumbnailUrl ? (
                            <img
                              src={hit.thumbnailUrl}
                              alt=""
                              className="yt-channel-search__thumb"
                              width="40"
                              height="40"
                            />
                          ) : null}
                          <span className="yt-channel-search__hit-title">{hit.title}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <div className="manual-feed-input-group">
                <input
                  type="text"
                  className="manual-feed-input"
                  placeholder={t.enterFeedUrl}
                  value={manualFeedUrl}
                  onChange={(e) => {
                    setManualFeedUrl(e.target.value)
                    setFeedValidationResult(null) // Clear previous results
                  }}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && manualFeedUrl.trim()) {
                      handleValidateFeed()
                    }
                  }}
                />
                <button
                  className="validate-feed-btn"
                  onClick={handleValidateFeed}
                  disabled={!manualFeedUrl.trim() || validatingFeed}
                >
                  {validatingFeed ? t.validating : t.validateFeed}
                </button>
              </div>
              
              {feedValidationResult && (
                <div className={`feed-validation-result ${feedValidationResult.valid ? 'valid' : 'invalid'}`}>
                  {feedValidationResult.valid ? (
                    <div className="feed-validation-success">
                      <div className="validation-header">
                        <span className="validation-icon">✓</span>
                        <strong>{t.feedValid}</strong>
                      </div>
                      {feedValidationResult.channel && (
                        <div className="feed-channel-info">
                          <div className="feed-info-row">
                            <span className="feed-info-label">{t.feedTitle}:</span>
                            <input
                              type="text"
                              className="feed-title-input"
                              value={feedTitle}
                              onChange={(e) => setFeedTitle(e.target.value)}
                              placeholder={feedValidationResult.channel.title || 'Untitled Feed'}
                              style={{
                                flex: 1,
                                padding: '6px 10px',
                                border: '1px solid #ddd',
                                borderRadius: '4px',
                                fontSize: '14px',
                                marginLeft: '8px'
                              }}
                            />
                          </div>
                          {feedValidationResult.channel.description && (
                            <div className="feed-info-row">
                              <span className="feed-info-label">{t.feedDescription}:</span>
                              <span className="feed-info-value">{feedValidationResult.channel.description}</span>
                            </div>
                          )}
                          <div className="feed-info-row">
                            <span className="feed-info-label">{t.feedLanguage}:</span>
                            <span className="feed-info-value">{feedValidationResult.channel.language || t.detectingLanguage}</span>
                          </div>
                          <div className="feed-info-row">
                            <span className="feed-info-label">{t.feedFormatKind}:</span>
                            <span className="feed-info-value">
                              {feedValidationResult.feedFormat === 'atom' ? t.feedFormatAtom : t.feedFormatRss2}
                            </span>
                          </div>
                          <div className="feed-info-row">
                            <span className="feed-info-label">{t.feedItemCount}:</span>
                            <span className="feed-info-value">{feedValidationResult.channel.itemCount || 0}</span>
                          </div>
                          <button
                            className="add-validated-feed-btn"
                            onClick={handleAddValidatedFeed}
                          >
                            {t.addSelected}
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="feed-validation-error">
                      <div className="validation-header">
                        <span className="validation-icon">✗</span>
                        <strong>{t.feedInvalid}</strong>
                      </div>
                      {feedValidationResult.errors && feedValidationResult.errors.length > 0 && (
                        <div className="validation-errors">
                          <strong>{t.feedMissingFields}:</strong>
                          <ul>
                            {feedValidationResult.errors.map((error, idx) => (
                              <li key={idx}>{error}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {feedValidationResult.warnings && feedValidationResult.warnings.length > 0 && (
                        <div className="validation-warnings">
                          <strong>{t.feedWarnings}:</strong>
                          <ul>
                            {feedValidationResult.warnings.map((warning, idx) => (
                              <li key={idx}>{warning}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {feedValidationResult.channel && (
                        <div className="feed-channel-info">
                          <div className="feed-info-row">
                            <span className="feed-info-label">{t.feedTitle}:</span>
                            <span className="feed-info-value">{feedValidationResult.channel.title || 'N/A'}</span>
                          </div>
                          {feedValidationResult.channel.description && (
                            <div className="feed-info-row">
                              <span className="feed-info-label">{t.feedDescription}:</span>
                              <span className="feed-info-value">{feedValidationResult.channel.description}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="settings-sources-body settings-main">
          {/* Search Bar */}
          <div className="settings-section settings-search-section">
            <h2>{t.searchSources}</h2>
            <div className="source-search-container">
              <input
                type="text"
                className="source-search-input"
                placeholder={t.searchSourcesPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchResults.length > 0 && (
                <div className="search-results-header">
                  <span>{t.showingResults} {searchResults.length} {t.results}</span>
                </div>
              )}
            </div>
          </div>

          {/* Two Column Layout: Available Sources | Enabled Sources */}
          <div className="sources-two-column">
            {/* Available Sources */}
            <div className="sources-column">
              <div className="column-header">
                <h3>
                  <span className="settings-sources-col-heading__full">{t.availableSources}</span>
                  <span className="settings-sources-col-heading__short">{t.availableSourcesShort}</span>
                </h3>
                <div className="header-buttons">
                  {searchResults.length > 0 && (
                    <button type="button" className="select-all-btn" onClick={toggleSelectAll}>
                      {allSelected ? t.deselectAll : t.selectAll}
                    </button>
                  )}
                  {selectedAvailableSources.size > 0 && (
                    <button type="button" className="add-selected-btn" onClick={handleAddSelected}>
                      {t.addSelected} ({selectedAvailableSources.size})
                    </button>
                  )}
                </div>
              </div>
              <div className="sources-list-container">
                {searchResults.length === 0 ? (
                  <div className="no-results">{t.noResults}</div>
                ) : (
                  <div className="sources-list-compact">
                    {searchResults.map((source, idx) => {
                      const isActive = activeSourceUrls.has(source.url)
                      const isSelected = selectedAvailableSources.has(source.url)
                      
                      return (
                        <div 
                          key={idx} 
                          className={`source-item-compact ${isActive ? 'active' : ''} ${isSelected ? 'selected' : ''}`}
                        >
                          <label className="source-checkbox-label-compact">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleAvailableSourceSelection(source.url)}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <div className="source-info-compact">
                              <div className="source-name-row">
                                <span className="source-name">{source.name}</span>
                                {isActive && (
                                  <span className="active-badge">✓</span>
                                )}
                              </div>
                              <div className="source-meta-compact">
                                {source.region && (
                                  <span className="source-region">{source.region}</span>
                                )}
                                <span className="source-language">{source.language}</span>
                                <span className="source-type">{source.type}</span>
                              </div>
                            </div>
                          </label>
                          <button
                            className={`toggle-source-btn-compact ${isActive ? 'remove' : 'add'}`}
                            onClick={() => handleToggleSource(source)}
                            title={isActive ? t.disableSource : t.enableSource}
                          >
                            {isActive ? '−' : '+'}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Enabled Sources */}
            <div className="sources-column">
              <div className="column-header">
                <h3>
                  <span className="settings-sources-col-heading__full">{t.activeSources}</span>
                  <span className="settings-sources-col-heading__short">{t.activeSourcesShort}</span>{' '}
                  ({config.sources.length})
                </h3>
                <div className="header-buttons">
                  {config.sources.length > 0 && (
                    <button 
                      className="select-all-btn"
                      onClick={toggleSelectAllActive}
                    >
                      {allActiveSelected ? t.deselectAll : t.selectAll}
                    </button>
                  )}
                  {selectedActiveSources.size > 0 && (
                    <button 
                      className="remove-selected-btn"
                      onClick={handleRemoveSelected}
                    >
                      {t.removeSelected} ({selectedActiveSources.size})
                    </button>
                  )}
                </div>
              </div>
              <div className="sources-list-container">
                {config.sources.length === 0 ? (
                  <div className="no-results">No active sources</div>
                ) : (
                  <div className="sources-list-compact">
                    {config.sources.map((source, idx) => {
                      const isSelected = selectedActiveSources.has(source.url)
                      return (
                        <div 
                          key={idx} 
                          className={`source-item-compact active ${isSelected ? 'selected' : ''}`}
                          style={{ cursor: 'pointer' }}
                          onClick={(e) => {
                            // Don't copy if clicking on checkbox or remove button
                            if (e.target.type === 'checkbox' || e.target.closest('button')) {
                              return
                            }
                            handleCopySourceUrl(source.url, source.name)
                          }}
                          title={`Click to copy URL: ${source.url}`}
                        >
                          <label className="source-checkbox-label-compact">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleActiveSourceSelection(source.url)}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <div className="source-info-compact">
                              <div className="source-name-row">
                                <span className="source-name">{source.name}</span>
                                <span className="active-badge">✓</span>
                              </div>
                              <div className="source-meta-compact">
                                {source.region && (
                                  <span className="source-region">{source.region}</span>
                                )}
                                <span className="source-language">{source.language}</span>
                              </div>
                              <div className="source-url-compact" title={source.url}>
                                {source.url.length > 50 ? `${source.url.substring(0, 50)}...` : source.url}
                              </div>
                            </div>
                          </label>
                          <button
                            className="toggle-source-btn-compact remove"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleRemoveSource(source.url)
                            }}
                            title={t.removeSource}
                          >
                            ×
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Import/Export */}
          <div className="settings-section">
            <div className="config-actions">
              <button className="export-btn" onClick={handleExport}>
                {t.exportConfig}
              </button>
              <label className="import-btn">
                {t.importConfig}
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImport}
                  style={{ display: 'none' }}
                />
              </label>
            </div>
          </div>
        </div>
        </div>
      </div>

      {restoreModal ? (
        <div
          className="settings-restore-built-in-overlay"
          role="presentation"
          onClick={closeRestoreModal}
        >
          <div
            className="settings-restore-built-in-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-restore-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            {restoreModal.mode === 'already-default' ? (
              <>
                <h3 id="settings-restore-modal-title" className="settings-restore-built-in-title">
                  {t.restoreDefaultsAlreadyTitle}
                </h3>
                <p className="settings-restore-built-in-text">{t.restoreDefaultsAlreadyMessage}</p>
                <div className="settings-restore-built-in-footer settings-restore-built-in-footer--single">
                  <button
                    type="button"
                    className="settings-restore-built-in-primary"
                    onClick={closeRestoreModal}
                  >
                    {t.restoreDefaultsAlreadyOk}
                  </button>
                </div>
              </>
            ) : null}

            {restoreModal.mode === 'confirm' ? (
              <>
                <h3 id="settings-restore-modal-title" className="settings-restore-built-in-title">
                  {t.restoreDefaultTitle}
                </h3>
                <p className="settings-restore-built-in-text">
                  {(() => {
                    const key = restoreModal.key
                    const hasSources = (activeTab?.sources?.length ?? 0) > 0
                    if (key === 'montreal') {
                      return hasSources
                        ? t.restoreDefaultMessageHasSources
                        : t.restoreDefaultMessageEmptyTab
                    }
                    if (key === 'canada') {
                      return hasSources
                        ? t.restoreDefaultMessageHasSourcesCanada
                        : t.restoreDefaultMessageEmptyTabCanada
                    }
                    return hasSources
                      ? t.restoreDefaultMessageHasSourcesTech
                      : t.restoreDefaultMessageEmptyTabTech
                  })()}
                </p>
                <div className="settings-restore-built-in-footer">
                  <button type="button" className="settings-restore-built-in-secondary" onClick={closeRestoreModal}>
                    {t.cancel}
                  </button>
                  <button
                    type="button"
                    className="settings-restore-built-in-primary"
                    onClick={executeRestoreCurrentBuiltInTab}
                  >
                    {t.restore}
                  </button>
                </div>
              </>
            ) : null}

            {restoreModal.mode === 'picker' ? (
              <>
                <h3 id="settings-restore-modal-title" className="settings-restore-built-in-title">
                  {t.restoreUnknownTabTitle}
                </h3>
                <p className="settings-restore-built-in-text">{t.restoreUnknownTabMessage}</p>
                <div className="settings-restore-built-in-actions">
                  <button
                    type="button"
                    className="settings-restore-built-in-choice"
                    onClick={() => applyUpsertBuiltInTab('montreal')}
                  >
                    {t.restoreMontrealTab}
                  </button>
                  <button
                    type="button"
                    className="settings-restore-built-in-choice"
                    onClick={() => applyUpsertBuiltInTab('canada')}
                  >
                    {t.restoreCanadaTab}
                  </button>
                  <button
                    type="button"
                    className="settings-restore-built-in-choice"
                    onClick={() => applyUpsertBuiltInTab('tech')}
                  >
                    {t.restoreTechTab}
                  </button>
                </div>
                <button type="button" className="settings-restore-built-in-cancel" onClick={closeRestoreModal}>
                  {t.cancel}
                </button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  )
}
