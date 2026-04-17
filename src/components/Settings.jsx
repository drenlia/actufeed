import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { translations } from '../constants/translations'
import {
  searchSources,
  getAllSources,
  getAllCountries,
  CATALOG_BROWSE_LIMIT,
} from '../services/sourceSearchService'
import { saveNewsConfig, exportConfig, importConfig } from '../utils/newsConfigUtils'
import { loadSettingsPreferences, saveSettingsPreferences } from '../utils/settingsStorage'
import { clearCachedNews } from '../utils/storageUtils'
import { validateRssFeed } from '../utils/rssValidator'
import { buildFirstArticlePreviewFromXml } from '../services/rssService'
import { FeedPreviewModal } from './FeedPreviewModal'
import { PresetFeedsBrowseModal } from './PresetFeedsBrowseModal'
import {
  searchYoutubeChannels,
  YOUTUBE_SEARCH_UNAVAILABLE,
  youtubeChannelPageUrl,
} from '../services/youtubeChannelSearch'
import { useToastContext } from '../contexts/ToastContext'
import { copyTextToClipboard } from '../utils/copyToClipboard'
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
  getNextTabIdCyclicFromTabs,
} from '../utils/tabsStorage'
import { isTypingInField } from '../utils/keyboardShortcuts'
import {
  classifyDefaultTab,
  sourcesForDefaultTab,
  DEFAULT_TAB_NAMES,
  sourcesMatchDefaults,
} from '../constants/defaultSources'

function SettingsToolbarIconPlus({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

function SettingsToolbarIconEarth({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.75" />
      <path d="M2 12h20" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <path
        d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
        stroke="currentColor"
        strokeWidth="1.75"
      />
    </svg>
  )
}

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
  /** When set, syncs manual feed modal for the guided tour (step indices match App). */
  guidedTourStep = null,
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
  const [openArticleInReader, setOpenArticleInReader] = useState(true)
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

  const [manualFeedModalOpen, setManualFeedModalOpen] = useState(false)
  const [presetBrowseOpen, setPresetBrowseOpen] = useState(false)
  const [restoreModal, setRestoreModal] = useState(null)

  const closePresetBrowseModal = useCallback(() => setPresetBrowseOpen(false), [])
  const closeManualFeedModal = useCallback(() => setManualFeedModalOpen(false), [])
  const manualModalDoneRef = useRef(null)
  const closeManualFeedModalRef = useRef(closeManualFeedModal)
  closeManualFeedModalRef.current = closeManualFeedModal

  useEffect(() => {
    if (!manualFeedModalOpen) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') closeManualFeedModalRef.current()
    }
    document.addEventListener('keydown', onKey)
    const id = requestAnimationFrame(() => manualModalDoneRef.current?.focus())
    return () => {
      document.removeEventListener('keydown', onKey)
      cancelAnimationFrame(id)
    }
  }, [manualFeedModalOpen])

  useLayoutEffect(() => {
    if (guidedTourStep == null) return
    if (guidedTourStep === 7) {
      setPresetBrowseOpen(false)
      setManualFeedModalOpen(true)
    } else if (guidedTourStep === 6 || guidedTourStep === 8) {
      setManualFeedModalOpen(false)
    }
  }, [guidedTourStep])

  const [feedPreviewOpen, setFeedPreviewOpen] = useState(false)
  const [feedPreviewLoading, setFeedPreviewLoading] = useState(false)
  const [feedPreviewItem, setFeedPreviewItem] = useState(null)
  const [feedPreviewError, setFeedPreviewError] = useState(null)
  const [feedPreviewFeedFormat, setFeedPreviewFeedFormat] = useState('rss2')

  /** Active-sources column: inline rename (double-click name) */
  const [renamingSourceUrl, setRenamingSourceUrl] = useState(null)
  const [renameDraft, setRenameDraft] = useState('')
  const renameInputRef = useRef(null)

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
    setOpenArticleInReader(preferences.openArticleInReader !== false)
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

  useEffect(() => {
    if (!renamingSourceUrl) return undefined
    const id = requestAnimationFrame(() => {
      renameInputRef.current?.focus()
      renameInputRef.current?.select()
    })
    return () => cancelAnimationFrame(id)
  }, [renamingSourceUrl])

  const cancelActiveSourceRename = useCallback(() => {
    setRenamingSourceUrl(null)
    setRenameDraft('')
  }, [])

  useEffect(() => {
    cancelActiveSourceRename()
  }, [activeTabId, cancelActiveSourceRename])

  const finishActiveSourceRename = useCallback(() => {
    if (!renamingSourceUrl || !activeTabId || !config) {
      cancelActiveSourceRename()
      return
    }
    const url = renamingSourceUrl
    const draft = renameDraft
    const original = config.sources.find((s) => s.url === url)
    setRenamingSourceUrl(null)
    setRenameDraft('')
    if (!original) return
    const next = draft.trim() || original.name
    if (next === original.name) return
    const updatedSources = config.sources.map((s) => (s.url === url ? { ...s, name: next } : s))
    const updatedTabs = updateTabSources(tabs, activeTabId, updatedSources)
    setTabs(updatedTabs)
    saveTabs(updatedTabs)
    setConfig({ ...config, sources: updatedSources })
    success(t.sourceRenamed)
  }, [
    renamingSourceUrl,
    renameDraft,
    activeTabId,
    config,
    tabs,
    cancelActiveSourceRename,
    success,
    t.sourceRenamed,
  ])

  // Copy source URL to clipboard
  const handleCopySourceUrl = async (sourceUrl, sourceName) => {
    const ok = await copyTextToClipboard(sourceUrl)
    if (ok) {
      success(`Copied ${sourceName} URL to clipboard`)
    } else {
      showError('Failed to copy URL to clipboard')
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
      const res = await searchYoutubeChannels(q)
      const items = Array.isArray(res?.items) ? res.items : []
      if (items.length === 0) setYtError(t.youtubeNoResults)
      setYtResults(items)
    } catch (e) {
      const msg = e && typeof e.message === 'string' ? e.message : ''
      if (msg === YOUTUBE_SEARCH_UNAVAILABLE) {
        setYtError(t.youtubeSearchNotConfigured)
      } else if (
        e instanceof TypeError ||
        /failed to fetch|networkerror|load failed/i.test(msg)
      ) {
        setYtError(t.youtubeSearchNetworkError)
      } else {
        setYtError(msg ? `${t.youtubeSearchFailed} — ${msg}` : t.youtubeSearchFailed)
      }
      setYtResults([])
    } finally {
      setYtLoading(false)
    }
  }

  const closeFeedPreviewModal = useCallback(() => {
    setFeedPreviewOpen(false)
    setFeedPreviewLoading(false)
    setFeedPreviewItem(null)
    setFeedPreviewError(null)
    setFeedPreviewFeedFormat('rss2')
  }, [])

  const commitManualFeed = useCallback(
    ({
      feedUrl,
      resolvedFeedUrl = null,
      finalTitle,
      language,
      feedFormat,
      closePreview = false,
    }) => {
      const resolved = resolvedFeedUrl?.trim()
      if (
        config.sources.some(
          (s) => s.url === feedUrl || (resolved && s.url === resolved)
        )
      ) {
        showError('This feed is already in your sources')
        return
      }
      if (!activeTabId) {
        showError('No active tab selected')
        return
      }
      const newSource = {
        name: finalTitle,
        url: feedUrl,
        language: language || 'en',
        region: '',
        country: '',
        province: '',
        feedFormat: feedFormat === 'atom' ? 'atom' : 'rss2',
      }
      const updatedSources = [...config.sources, newSource]
      const updatedTabs = updateTabSources(tabs, activeTabId, updatedSources)
      setTabs(updatedTabs)
      saveTabs(updatedTabs)
      const updatedConfig = { ...config, sources: updatedSources }
      setConfig(updatedConfig)
      clearCachedNews(activeTabId)
      success(t.feedAdded)
      setManualFeedUrl('')
      setFeedValidationResult(null)
      setFeedTitle('')
      if (closePreview) {
        closeFeedPreviewModal()
      }
    },
    [activeTabId, config, tabs, setTabs, setConfig, success, showError, t.feedAdded, closeFeedPreviewModal]
  )

  // Validate manual RSS feed
  const handleValidateFeed = async () => {
    const url = manualFeedUrl.trim()
    if (!url) return

    const normalizedUrl = url.replace(/\/$/, '')
    const existingSource = config?.sources?.find(
      (s) => String(s.url).trim().replace(/\/$/, '') === normalizedUrl
    )
    if (existingSource) {
      setFeedValidationResult({
        feedAlreadyInList: true,
        existingSourceName: existingSource.name || '',
      })
      setFeedTitle('')
      closeFeedPreviewModal()
      return
    }

    setValidatingFeed(true)
    setFeedValidationResult(null)
    setFeedTitle('')
    closeFeedPreviewModal()

    try {
      const result = await validateRssFeed(url, uiLanguage)
      setFeedValidationResult(result)

      if (result.valid && result.channel?.title) {
        setFeedTitle(result.channel.title)
      } else if (result.channel?.title) {
        setFeedTitle(result.channel.title)
      } else {
        setFeedTitle('')
      }

      const previewEligible = Boolean(result.previewEligible && result.xmlText)

      if (previewEligible) {
        setFeedPreviewOpen(true)
        setFeedPreviewLoading(true)
        setFeedPreviewItem(null)
        setFeedPreviewError(null)
        try {
          const built = await buildFirstArticlePreviewFromXml(result.xmlText, {
            feedUrl: url,
            channelTitle: result.channel?.title,
            language: result.channel?.language || 'en',
          })
          if (built.error) {
            setFeedPreviewError(built.error)
          } else {
            setFeedPreviewItem(built.item)
            setFeedPreviewFeedFormat(built.feedFormat || 'rss2')
          }
        } catch (e) {
          setFeedPreviewError(e?.message || String(e))
        } finally {
          setFeedPreviewLoading(false)
        }
        return
      }

      if (!result.valid && result.errors && result.errors.length > 0) {
        showError(result.errors[0])
      }
    } catch (error) {
      const errorResult = {
        valid: false,
        errors: [`Validation error: ${error.message}`],
        warnings: [],
      }
      setFeedValidationResult(errorResult)
      setFeedTitle('')
      showError(`Validation error: ${error.message}`)
    } finally {
      setValidatingFeed(false)
    }
  }

  const handleAddValidatedFeed = () => {
    if (!feedValidationResult?.valid || !feedValidationResult.channel) {
      return
    }
    const feedUrl = (feedValidationResult.resolvedFeedUrl || manualFeedUrl).trim()
    const resolved = feedValidationResult.resolvedFeedUrl?.trim()
    const finalTitle = feedTitle.trim() || feedValidationResult.channel.title || 'Untitled Feed'
    commitManualFeed({
      feedUrl,
      resolvedFeedUrl: resolved || null,
      finalTitle,
      language: feedValidationResult.channel.language || 'en',
      feedFormat: feedValidationResult.feedFormat === 'atom' ? 'atom' : 'rss2',
      closePreview: false,
    })
  }

  const handleAddAnywayFromPreview = useCallback(() => {
    if (!feedValidationResult?.channel || !feedPreviewItem) return
    const feedUrl = manualFeedUrl.trim()
    const finalTitle = feedTitle.trim() || feedValidationResult.channel.title || 'Untitled Feed'
    commitManualFeed({
      feedUrl,
      resolvedFeedUrl: feedValidationResult.resolvedFeedUrl?.trim() || null,
      finalTitle,
      language: feedValidationResult.channel.language || 'en',
      feedFormat: feedPreviewFeedFormat,
      closePreview: true,
    })
  }, [
    commitManualFeed,
    feedValidationResult,
    feedPreviewItem,
    feedPreviewFeedFormat,
    feedTitle,
    manualFeedUrl,
  ])

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

  const handleSwitchTab = useCallback((tabId) => {
    setActiveTabIdState(tabId)
    setActiveTabId(tabId)

    const tab = tabs.find((t) => t.id === tabId)
    if (tab?.name) {
      const url = new URL(window.location.href)
      url.searchParams.set('tab', encodeURIComponent(tab.name))
      window.history.replaceState({}, '', url.toString())
    }
  }, [tabs])

  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const k = e.key.length === 1 ? e.key.toLowerCase() : ''
      if (k !== 't') return
      if (isTypingInField(e.target)) return
      e.preventDefault()
      const nextId = getNextTabIdCyclicFromTabs(tabs, activeTabId)
      if (nextId) handleSwitchTab(nextId)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tabs, activeTabId, handleSwitchTab])

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

  const toggleOpenArticleInReader = () => {
    const newValue = !openArticleInReader
    setOpenArticleInReader(newValue)
    saveSettingsPreferences({ openArticleInReader: newValue })
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
            <div
              className="settings-header-tabbar-tour"
              data-tour="tour-settings-tabbar"
            >
              {tabs.length > 0 ? (
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
              ) : null}
            </div>
          }
        />
      </div>
      <div className="settings-page">
        <div className="settings-page-stack">
          <div className="settings-actions-card settings-glass-panel">
            <div className="settings-actions-card__toolbar">
              <div className="settings-toolbar-cluster">
                <div className="settings-action-buttons" role="group" aria-label={t.addManualFeed}>
                  <button
                    type="button"
                    data-tour="tour-manual-feed-btn"
                    className={`settings-action-buttons__btn${manualFeedModalOpen ? ' is-active' : ''}`}
                    title={t.addManualFeed}
                    onClick={() => {
                      setPresetBrowseOpen(false)
                      setManualFeedModalOpen(true)
                    }}
                  >
                    <span className="settings-action-buttons__inner">
                      <SettingsToolbarIconPlus className="settings-action-buttons__icon" />
                      <span>{t.settingsToolbarManual}</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    data-tour="tour-browse"
                    className="settings-action-buttons__btn settings-action-buttons__btn--browse"
                    title={t.browsePresetFeeds}
                    onClick={() => {
                      setManualFeedModalOpen(false)
                      setPresetBrowseOpen(true)
                    }}
                  >
                    <span className="settings-action-buttons__inner">
                      <SettingsToolbarIconEarth className="settings-action-buttons__icon settings-action-buttons__icon--earth" />
                      <span>{t.settingsToolbarBrowse}</span>
                    </span>
                  </button>
                </div>
                <div
                  className="settings-toolbar-config settings-toolbar-config--separated"
                  data-tour="tour-export-import"
                  role="group"
                  aria-label={t.settingsConfigLabel}
                >
                  <button
                    type="button"
                    className="settings-toolbar-config__btn"
                    title={t.exportConfig}
                    onClick={handleExport}
                  >
                    {t.exportVerb}
                  </button>
                  <label
                    className="settings-toolbar-config__btn settings-toolbar-config__btn--import"
                    title={t.importConfig}
                  >
                    {t.importVerb}
                    <input
                      type="file"
                      accept=".json"
                      className="settings-toolbar-config__file-input"
                      onChange={handleImport}
                    />
                  </label>
                </div>
              </div>
              <div
                className="toast-toggle-container toast-toggle-container--fetch-banners-only"
                title={t.showToastMessagesTooltip}
              >
                <span id="settings-fetch-banners-desc" className="settings-toggle-tooltip-desc">
                  {t.showToastMessagesTooltip}
                </span>
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
                  aria-describedby="settings-fetch-banners-desc"
                >
                  <span className="settings-fetch-toast-switch-knob" aria-hidden />
                </button>
              </div>
              <div className="toast-toggle-container" data-tour="tour-reader-toggle" title={t.openArticleInReaderTooltip}>
                <span id="settings-open-reader-desc" className="settings-toggle-tooltip-desc">
                  {t.openArticleInReaderTooltip}
                </span>
                <label className="settings-toast-toggle-label" htmlFor="settings-open-article-reader-switch">
                  {t.openArticleInReaderLabel}
                </label>
                <button
                  type="button"
                  id="settings-open-article-reader-switch"
                  className={`settings-fetch-toast-switch ${openArticleInReader ? 'is-on' : ''}`}
                  onClick={toggleOpenArticleInReader}
                  role="switch"
                  aria-checked={openArticleInReader}
                  aria-label={t.openArticleInReaderLabel}
                  aria-describedby="settings-open-reader-desc"
                >
                  <span className="settings-fetch-toast-switch-knob" aria-hidden />
                </button>
              </div>
            </div>
          </div>

          <div className="settings-content-card settings-glass-panel">
              <div
                className="settings-active-panel settings-sources-body settings-main"
                data-tour="tour-settings-active-panel"
              >
                <p className="settings-active-panel__hint">{t.settingsActiveSourcesHint}</p>
                <div className="sources-column sources-column--active-full">
                  <div className="column-header settings-active-panel__header">
                    <h2 className="settings-active-panel__title">
                      <span className="settings-sources-col-heading__full">{t.activeSources}</span>
                      <span className="settings-sources-col-heading__short">{t.activeSourcesShort}</span>
                      <span
                        className="settings-active-panel__count-pill"
                        title={`${config.sources.length}`}
                        aria-label={String(config.sources.length)}
                      >
                        {config.sources.length}
                      </span>
                    </h2>
                    <div className="header-buttons settings-active-panel__actions">
                      {config.sources.length > 0 ? (
                        <button type="button" className="select-all-btn" onClick={toggleSelectAllActive}>
                          {allActiveSelected ? t.deselectAll : t.selectAll}
                        </button>
                      ) : null}
                      {selectedActiveSources.size > 0 ? (
                        <button type="button" className="remove-selected-btn" onClick={handleRemoveSelected}>
                          {t.removeSelected} ({selectedActiveSources.size})
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="sources-list-container">
                    {config.sources.length === 0 ? (
                      <div className="no-results settings-active-panel__empty">{t.noActiveSourcesYet}</div>
                    ) : (
                      <div className="sources-list-compact">
                        {config.sources.map((source, idx) => {
                          const isSelected = selectedActiveSources.has(source.url)
                          return (
                            <div
                              key={`${idx}-${source.url || 'source'}`}
                              className={`source-item-compact active ${isSelected ? 'selected' : ''}`}
                              title={t.activeSourceRowHint}
                            >
                              <label className="source-checkbox-label-compact">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => toggleActiveSourceSelection(source.url)}
                                  onClick={(e) => e.stopPropagation()}
                                />
                                <div className="source-info-compact">
                                  <div className="source-item-compact__title-line">
                                    <div className="source-name-row source-name-row--with-inline-meta">
                                      <div className="source-title-append">
                                        {renamingSourceUrl === source.url ? (
                                          <input
                                            ref={renameInputRef}
                                            type="text"
                                            className="source-name-rename-input"
                                            value={renameDraft}
                                            aria-label={t.feedTitle}
                                            onChange={(e) => setRenameDraft(e.target.value)}
                                            onClick={(e) => e.stopPropagation()}
                                            onKeyDown={(e) => {
                                              if (e.key === 'Enter') {
                                                e.preventDefault()
                                                finishActiveSourceRename()
                                              } else if (e.key === 'Escape') {
                                                e.preventDefault()
                                                cancelActiveSourceRename()
                                              }
                                            }}
                                            onBlur={(e) => {
                                              const to = e.relatedTarget
                                              const row = e.currentTarget.closest('.source-item-compact')
                                              if (
                                                to &&
                                                row &&
                                                typeof to.closest === 'function' &&
                                                row.contains(to) &&
                                                (to.closest('button') ||
                                                  (to instanceof HTMLInputElement && to.type === 'checkbox'))
                                              ) {
                                                cancelActiveSourceRename()
                                                return
                                              }
                                              finishActiveSourceRename()
                                            }}
                                          />
                                        ) : (
                                          <span
                                            className="source-name"
                                            title={t.sourceNameDoubleClickRename}
                                            onClick={(e) => e.stopPropagation()}
                                            onDoubleClick={(e) => {
                                              e.preventDefault()
                                              e.stopPropagation()
                                              setRenamingSourceUrl(source.url)
                                              setRenameDraft(source.name)
                                            }}
                                          >
                                            {source.name}
                                          </span>
                                        )}
                                        <div className="source-meta-compact source-meta-compact--appended">
                                          {source.region ? (
                                            <span className="source-region">{source.region}</span>
                                          ) : null}
                                          <span className="source-language">{source.language}</span>
                                        </div>
                                      </div>
                                      <span className="active-badge">✓</span>
                                    </div>
                                    <button
                                      type="button"
                                      className="toggle-source-btn-compact remove source-item-compact__remove-btn"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        handleRemoveSource(source.url)
                                      }}
                                      title={t.removeSource}
                                      aria-label={t.removeSource}
                                    >
                                      <svg
                                        className="toggle-source-btn-compact__icon"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        aria-hidden="true"
                                      >
                                        <path
                                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                          stroke="currentColor"
                                          strokeWidth="1.75"
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                        />
                                      </svg>
                                    </button>
                                  </div>
                                  <button
                                    type="button"
                                    className="source-url-copy-btn"
                                    title={`${t.activeSourceCopyFeedUrl} — ${source.url}`}
                                    aria-label={`${t.activeSourceCopyFeedUrl}: ${source.url}`}
                                    onClick={(e) => {
                                      e.preventDefault()
                                      e.stopPropagation()
                                      handleCopySourceUrl(source.url, source.name)
                                    }}
                                  >
                                    {source.url.length > 50 ? `${source.url.substring(0, 50)}...` : source.url}
                                  </button>
                                </div>
                              </label>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                  <div className="settings-active-sources-footer">
                    <button
                      type="button"
                      className="settings-restore-defaults-btn--list-footer"
                      onClick={openRestoreDefaultSourcesFlow}
                    >
                      {t.restoreDefaultSources}
                    </button>
                  </div>
                </div>
              </div>
          </div>
        </div>
      </div>

      {manualFeedModalOpen ? (
        <div
          className={`preset-browse-overlay${guidedTourStep === 7 ? ' preset-browse-overlay--tour-spotlight' : ''}`}
          role="presentation"
          onClick={closeManualFeedModal}
        >
          <div
            className={`preset-browse-dialog settings-glass-panel manual-feed-add-dialog${
              guidedTourStep === 7 ? ' manual-feed-add-dialog--tour-spotlight' : ''
            }`}
            data-tour="tour-manual-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="manual-feed-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="preset-browse-header">
              <div className="manual-feed-modal-header__lead">
                <h2 id="manual-feed-modal-title" className="preset-browse-title">
                  {t.settingsManualFormTitle}
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
              <button
                ref={manualModalDoneRef}
                type="button"
                className="preset-browse-done-btn"
                onClick={closeManualFeedModal}
              >
                {t.presetBrowseDone}
              </button>
            </div>
            <div className="manual-feed-add-body">
              <div
                id="manual-feed-collapsible"
                role="region"
                aria-labelledby="manual-feed-modal-title"
                className="manual-feed-container settings-section"
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
                <form
                  className="yt-channel-search__form"
                  onSubmit={(e) => {
                    e.preventDefault()
                    runYoutubeSearch()
                  }}
                >
                  <div className="yt-channel-search__row">
                    <input
                      type="search"
                      className="yt-channel-search__input"
                      placeholder={t.youtubeSearchPlaceholder}
                      value={ytQuery}
                      onChange={(e) => setYtQuery(e.target.value)}
                      autoComplete="off"
                      enterKeyHint="search"
                    />
                    <button
                      type="submit"
                      className="yt-channel-search__btn"
                      disabled={ytLoading}
                    >
                      {ytLoading ? t.youtubeSearching : t.youtubeSearchButton}
                    </button>
                  </div>
                </form>
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
                    setFeedValidationResult(null)
                    closeFeedPreviewModal()
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
                <div
                  className={`feed-validation-result ${
                    feedValidationResult.feedAlreadyInList
                      ? 'feed-validation-result--info'
                      : feedValidationResult.valid
                        ? 'valid'
                        : 'invalid'
                  }`}
                >
                  {feedValidationResult.feedAlreadyInList ? (
                    <div className="feed-validation-already">
                      <div className="validation-header">
                        <span className="validation-icon feed-validation-already__icon" aria-hidden>
                          ℹ
                        </span>
                        <strong>{t.feedAlreadyInListTitle}</strong>
                      </div>
                      <p className="feed-already-in-list-text">{t.feedAlreadyInListMessage}</p>
                      {feedValidationResult.existingSourceName ? (
                        <p className="feed-already-in-list-name">
                          {t.feedAlreadyInListAsName.replace(
                            '{name}',
                            feedValidationResult.existingSourceName
                          )}
                        </p>
                      ) : null}
                    </div>
                  ) : feedValidationResult.valid ? (
                    <div className="feed-validation-success">
                      <div className="validation-header validation-header--with-action">
                        <div className="validation-header__lead">
                          <span className="validation-icon">✓</span>
                          <strong>{t.feedValid}</strong>
                        </div>
                        {feedValidationResult.channel ? (
                          <button
                            type="button"
                            className="add-validated-feed-btn add-validated-feed-btn--header"
                            onClick={handleAddValidatedFeed}
                          >
                            {t.addSelected}
                          </button>
                        ) : null}
                      </div>
                      {feedValidationResult.warnings && feedValidationResult.warnings.length > 0 && (
                        <div className="validation-warnings feed-validation-warnings--success">
                          <strong>{t.feedWarnings}</strong>
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
                          <strong>{t.feedValidationDetails}:</strong>
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
        </div>
      ) : null}

      <PresetFeedsBrowseModal
        open={presetBrowseOpen}
        onClose={closePresetBrowseModal}
        t={t}
        availableCountries={availableCountries}
        countrySearchQuery={countrySearchQuery}
        onCountrySearchChange={setCountrySearchQuery}
        selectedCountries={selectedCountries}
        onToggleCountry={toggleCountryFilter}
        onClearCountryFilters={clearCountryFilters}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        searchResults={searchResults}
        selectedAvailableSources={selectedAvailableSources}
        onToggleAvailableSelection={toggleAvailableSourceSelection}
        onToggleSelectAllAvailable={toggleSelectAll}
        allAvailableSelected={allSelected}
        onAddSelected={handleAddSelected}
        activeSourceUrls={activeSourceUrls}
        onToggleSource={handleToggleSource}
      />

      <FeedPreviewModal
        open={feedPreviewOpen}
        onClose={closeFeedPreviewModal}
        uiLanguage={uiLanguage}
        t={t}
        previewItem={feedPreviewItem}
        loading={feedPreviewLoading}
        previewError={feedPreviewError}
        validationErrors={feedValidationResult?.errors || []}
        validationWarnings={feedValidationResult?.warnings || []}
        missingRequiredItemFields={feedValidationResult?.missingRequiredItemFields || []}
        itemLevelImagesMissing={Boolean(feedValidationResult?.itemLevelImagesMissing)}
        onAddAnyway={handleAddAnywayFromPreview}
        addAnywayDisabled={validatingFeed}
      />

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
