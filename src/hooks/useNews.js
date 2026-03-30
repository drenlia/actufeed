import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { loadNewsConfig } from '../utils/newsConfigUtils'
import { fetchRssFeed, createRssBatchId, notifyRssBatchComplete } from '../services/rssService'
import { loadCachedNews, saveNewsToCache, loadCachedArticleIds } from '../utils/storageUtils'
import { calculatePopularityScores } from '../utils/popularityUtils'
import { useToastContext } from '../contexts/ToastContext'

export const useNews = (tabSources = null, tabId = null, showToastMessages = true) => {
  const [news, setNews] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  const [newItemIds, setNewItemIds] = useState(new Set())
  const previousNewsIdsRef = useRef(new Set())
  
  // Toast API via ref so fetchNewsInternal stays stable when toasts update (avoids re-running fetch effect)
  const toastContext = useToastContext()
  const toastRef = useRef(toastContext)
  toastRef.current = toastContext
  
  // Use refs to track current tab sources and tabId to avoid stale closures
  const tabSourcesRef = useRef(tabSources)
  const tabIdRef = useRef(tabId)
  const showToastMessagesRef = useRef(showToastMessages)
  // Track which tab a fetch is for, to ignore results from wrong tab
  const fetchTabIdRef = useRef(tabId)
  // Track if we're currently fetching to prevent duplicate toasts
  const isFetchingRef = useRef(false)
  // Track the last fetch timestamp to debounce toasts
  const lastToastTimeRef = useRef(0)
  
  // Update refs when props change - do this FIRST before any other effects
  useEffect(() => {
    const previousTabId = tabIdRef.current
    tabSourcesRef.current = tabSources
    tabIdRef.current = tabId
    showToastMessagesRef.current = showToastMessages
    fetchTabIdRef.current = tabId // Update fetch tracking when tab changes
    
    // Reset previousNewsIdsRef when tab changes to avoid cross-tab contamination
    if (previousTabId !== null && previousTabId !== tabId) {
      previousNewsIdsRef.current = new Set()
    }
  }, [tabSources, tabId, showToastMessages])

  // Define fetchNewsInternal first - uses refs to get current values
  const fetchNewsInternal = useCallback(async (useCache = true, forceRefresh = false, showToast = false) => {
    // Get current values from refs to avoid stale closures
    // These are updated immediately when props change, so they should be current
    const currentTabSources = tabSourcesRef.current
    const currentTabId = tabIdRef.current
    const fetchForTabId = fetchTabIdRef.current
    
    // If tab changed while we were fetching, ignore this result
    if (currentTabId !== fetchForTabId) {
      return
    }
    
    // Prevent concurrent fetches for the same tab
    if (isFetchingRef.current) {
      console.warn('[News Feed] Already fetching, skipping duplicate request')
      return
    }
    
    isFetchingRef.current = true
    
    if (!useCache) {
      setError(null)
    } else {
      setLoading(true)
      setError(null)
    }

    let rssBatchId = null

    try {
      const allNews = []
      
      // Use tab sources if provided, otherwise fall back to config
      const sourcesToFetch = currentTabSources && currentTabSources.length > 0 ? currentTabSources : loadNewsConfig().sources
      
      if (sourcesToFetch.length === 0) {
        setNews([])
        setLoading(false)
        setIsInitialLoad(false)
        isFetchingRef.current = false
        return
      }

      rssBatchId = createRssBatchId()

      // Fetch sources in batches to avoid rate limiting
      // Batch size and delay can be adjusted based on rate limit settings
      const BATCH_SIZE = 50 // Fetch 50 feeds per batch
      const BATCH_DELAY = 2000 // Wait 2 seconds between batches
      
      const allResults = []
      const batches = []
      
      // Create batches
      for (let i = 0; i < sourcesToFetch.length; i += BATCH_SIZE) {
        batches.push(sourcesToFetch.slice(i, i + BATCH_SIZE))
      }
      
      // Fetch each batch sequentially with delay to prevent rate limiting
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex]
        
        // Fetch batch in parallel
        const batchPromises = batch.map((source) =>
          fetchRssFeed(source, { batchId: rssBatchId })
        )
        const batchResults = await Promise.allSettled(batchPromises)
        
        // Convert Promise.allSettled results to expected format
        const normalizedResults = batchResults.map(result => {
          if (result.status === 'fulfilled') {
            return result.value
          } else {
            // Handle rejected promises
            const source = batch[batchResults.indexOf(result)]
            const sourceName = source?.name || (typeof source === 'string' ? source : 'Unknown')
            return {
              news: [],
              error: {
                name: sourceName,
                message: result.reason?.message || 'Failed to fetch feed',
                status: 500
              }
            }
          }
        })
        
        allResults.push(...normalizedResults)
        
        // Wait before next batch (except for last batch)
        if (batchIndex < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, BATCH_DELAY))
        }
      }
      
      const results = allResults
      
      // Collect failed feeds and successful feeds
      const failedFeeds = []
      const successfulFeeds = []
      
      results.forEach((result, index) => {
        // Ensure result has the expected structure
        if (!result || typeof result !== 'object') {
          console.error(`[News Feed] Invalid result from fetchRssFeed for source ${index}:`, result)
          const source = sourcesToFetch[index]
          const sourceName = source?.name || (typeof source === 'string' ? source : 'Unknown')
          failedFeeds.push({
            name: sourceName,
            status: 500,
            message: 'Invalid response format'
          })
          return
        }
        
        const { news: sourceNews, error: sourceError } = result
        const source = sourcesToFetch[index]
        const sourceName = source?.name || (typeof source === 'string' ? source : 'Unknown')
        
        // Ensure sourceNews is an array
        if (!Array.isArray(sourceNews)) {
          console.error(`[News Feed] sourceNews is not an array for ${sourceName}:`, sourceNews)
          if (sourceError) {
            failedFeeds.push({
              name: sourceName,
              status: sourceError.status || 500,
              message: sourceError.message || 'Invalid response format'
            })
          } else {
            failedFeeds.push({
              name: sourceName,
              status: 500,
              message: 'Invalid response format'
            })
          }
          return
        }
        
        if (sourceError) {
          // Collect error information
          failedFeeds.push({
            name: sourceName,
            status: sourceError.status,
            message: sourceError.message
          })
        } else {
          // Add successful news
          allNews.push(...sourceNews)
          if (sourceNews.length > 0) {
            successfulFeeds.push({
              name: sourceName,
              articleCount: sourceNews.length
            })
          } else {
            successfulFeeds.push({
              name: sourceName,
              articleCount: 0
            })
          }
        }
      })
      
      // Respect the user's preference for showing toast messages
      const shouldShowToast = showToast && showToastMessagesRef.current
      
      // Show toast if requested and if there are failures, zero-article feeds, OR successful feeds
      // Use debouncing to prevent multiple toasts from rapid successive fetches
      const hasFailures = failedFeeds.length > 0
      const hasZeroArticleFeeds = successfulFeeds.some(f => f.articleCount === 0)
      const hasSuccessfulFeeds = successfulFeeds.some(f => f.articleCount > 0)
      
      // Show toast if there are any failures, zero-article feeds, or if user wants to see all results
      // Only show if both showToast parameter is true AND user preference allows it
      if (shouldShowToast && (hasFailures || hasZeroArticleFeeds || hasSuccessfulFeeds)) {
        const now = Date.now()
        // Only show toast if it's been at least 2 seconds since last toast
        if (now - lastToastTimeRef.current > 2000) {
          const statusText = (status) => {
            if (status === 403) return '403 error'
            if (status === 404) return '404 error'
            if (status === 504) return 'timeout'
            return `${status} error`
          }
          
          const failedList = failedFeeds.map(f => `• ${f.name}: ${statusText(f.status)}`).join('\n')
          const successfulList = successfulFeeds
            .filter(f => f.articleCount > 0)
            .map(f => `• ${f.name}: ${f.articleCount} articles`)
            .join('\n')
          const zeroArticleList = successfulFeeds
            .filter(f => f.articleCount === 0)
            .map(f => `• ${f.name}: no recent articles`)
            .join('\n')
          
          // Show success toast first (if there are successful feeds or zero-article feeds)
          if (successfulList || zeroArticleList) {
            let successMessage = ''
            if (successfulList) {
              successMessage = `Successfully fetched:\n${successfulList}`
              if (zeroArticleList) {
                successMessage += `\n\nNo recent articles (last 24h):\n${zeroArticleList}`
              }
            } else if (zeroArticleList) {
              successMessage = `No recent articles (last 24h):\n${zeroArticleList}`
            }
            
            if (successMessage) {
              lastToastTimeRef.current = now
              toastRef.current.success(successMessage, 10000)
            }
          }
          
          // Show failure toast separately (if there are failures)
          if (failedList) {
            const failureMessage = `Unable to fetch:\n${failedList}`
            // Use a small delay to show the error toast after the success toast
            setTimeout(() => {
              toastRef.current.error(failureMessage, 10000)
            }, 500)
          }
          
        }
      }
      
      console.log(`[News Feed] Total articles fetched: ${allNews.length}`)
      
      // Calculate popularity scores
      const newsWithScores = calculatePopularityScores(allNews)
      allNews.length = 0
      allNews.push(...newsWithScores)
      
      
      // Sort by date
      allNews.sort((a, b) => {
        const dateA = a.publishedAt.getTime()
        const dateB = b.publishedAt.getTime()
        
        if (isNaN(dateA) && isNaN(dateB)) return 0
        if (isNaN(dateA)) return 1
        if (isNaN(dateB)) return -1
        
        return dateB - dateA
      })
      
      // Get current source names for filtering (trimmed and normalized)
      const currentSourceNames = new Set(
        sourcesToFetch
          .map(s => {
            const name = s.name || (typeof s === 'string' ? '' : s.name)
            return name ? name.trim() : ''
          })
          .filter(n => n.length > 0)
      )
      
      // Replace news completely (don't merge with previous tab's news)
      // This ensures we only show news from the current tab's sources
      const finalNews = [...allNews] // Create a copy
      
      // Determine which articles are actually new (not in previous set)
      const previousIds = previousNewsIdsRef.current
      const newIds = new Set()
      allNews.forEach(item => {
        if (!previousIds.has(item.id)) {
          newIds.add(item.id)
        }
      })
      
      // Re-sort final news by date (newest first)
      finalNews.sort((a, b) => {
        const dateA = a.publishedAt.getTime()
        const dateB = b.publishedAt.getTime()
        
        if (isNaN(dateA) && isNaN(dateB)) return 0
        if (isNaN(dateA)) return 1
        if (isNaN(dateB)) return -1
        
        return dateB - dateA
      })
      
      // Double-check tab hasn't changed before setting news
      if (tabIdRef.current === fetchForTabId) {
        // Filter news to only include articles from current tab sources
        // This ensures articles from removed sources are immediately filtered out
        const currentSources = tabSourcesRef.current
        let filteredFinalNews = finalNews
        if (currentSources && currentSources.length > 0) {
          const sourceNames = new Set(
            currentSources
              .map(s => {
                const name = s?.name || (typeof s === 'string' ? '' : s.name)
                return name ? name.trim() : ''
              })
              .filter(n => n.length > 0)
          )
          if (sourceNames.size > 0) {
            filteredFinalNews = finalNews.filter(item => {
              const itemSource = item.source ? item.source.trim() : ''
              return itemSource && sourceNames.has(itemSource)
            })
          } else {
            // No sources, clear all news
            filteredFinalNews = []
          }
        }
        
        // Completely replace news (no merging with previous tab's news)
        setNews(filteredFinalNews)
        
        // Only show new items that are actually new (not in previous set)
        // Filter newIds to only include items that are in filteredFinalNews
        const filteredNewIds = new Set()
        filteredFinalNews.forEach(item => {
          if (newIds.has(item.id)) {
            filteredNewIds.add(item.id)
          }
        })
        
        if (filteredNewIds.size > 0) {
          setNewItemIds(filteredNewIds)
          setTimeout(() => {
            setNewItemIds(new Set())
          }, 3000)
        }
        
        // Update previousNewsIdsRef AFTER we've determined what's new
        previousNewsIdsRef.current = new Set(filteredFinalNews.map(item => item.id))
        // Use currentTabId from ref to ensure we save to the correct tab's cache
        saveNewsToCache(filteredFinalNews, currentTabId)
      }
      
      setIsInitialLoad(false)
    } catch (err) {
      setError(err.message)
      console.error('Error fetching news:', err)
      setIsInitialLoad(false)
    } finally {
      setLoading(false)
      isFetchingRef.current = false
      if (rssBatchId) {
        notifyRssBatchComplete(rssBatchId)
      }
    }
  }, [])

  // Define fetchNews after fetchNewsInternal
  const fetchNews = useCallback(async (useCache = true, forceRefresh = false) => {
    // Get current values from refs to ensure we're using the latest tab
    const currentTabSources = tabSourcesRef.current
    const currentTabId = tabIdRef.current
    
    // Use tab sources if provided, otherwise fall back to config
    const sourcesToUse = currentTabSources && currentTabSources.length > 0 ? currentTabSources : loadNewsConfig().sources
    
    // Load cache for the CURRENT tab only
    const cachedNews = loadCachedNews(sourcesToUse, currentTabId)
    
    if (cachedNews && cachedNews.length > 0 && useCache && !forceRefresh) {
      // Completely replace news with cached news for this tab (no merging)
      setNews(cachedNews)
      // Initialize previousNewsIdsRef with cached news so we can detect truly new articles
      previousNewsIdsRef.current = new Set(cachedNews.map(item => item.id))
      setLoading(false)
      setIsInitialLoad(false)
      // Fetch fresh data in background (use setTimeout to avoid recursion)
      // Don't show toast for background refreshes
      setTimeout(() => {
        fetchNewsInternal(false, false, false)
      }, 100)
      return
    }
    
    // Show toast for user-initiated fetches (initial load or manual refresh)
    await fetchNewsInternal(useCache, forceRefresh, true)
  }, [fetchNewsInternal])

  // Filter news when tabSources change (to remove articles from deleted sources)
  useEffect(() => {
    const currentTabSources = tabSourcesRef.current
    const currentTabId = tabIdRef.current
    
    // Filter existing news to match current sources
    if (currentTabSources && currentTabSources.length > 0) {
      setNews(prevNews => {
        const sourceNames = new Set(
          currentTabSources
            .map(s => {
              const name = s?.name || (typeof s === 'string' ? '' : s.name)
              return name ? name.trim() : ''
            })
            .filter(n => n.length > 0)
        )
        
        if (sourceNames.size > 0) {
          const filtered = prevNews.filter(item => {
            const itemSource = item.source ? item.source.trim() : ''
            return itemSource && sourceNames.has(itemSource)
          })
          
          if (filtered.length !== prevNews.length) {
            // Update cache with filtered news
            saveNewsToCache(filtered, currentTabId)
          }
          
          return filtered
        } else {
          // No sources, clear all news
          if (prevNews.length > 0) {
            saveNewsToCache([], currentTabId)
          }
          return []
        }
      })
    } else {
      // No sources, clear all news
      setNews([])
      saveNewsToCache([], currentTabId)
    }
  }, [JSON.stringify(tabSources), tabId])

  // Track previous tabSources to detect changes - use a more stable comparison
  const previousTabSourcesKeyRef = useRef(null)
  
  // Create a stable key for tabSources comparison
  const tabSourcesKey = useMemo(() => {
    if (!tabSources || tabSources.length === 0) return `tab-${tabId}-empty`
    const sourcesKey = tabSources
      .map(s => `${s?.name || ''}:${s?.url || ''}`)
      .sort()
      .join('|')
    return `tab-${tabId}-${sourcesKey}`
  }, [tabSources, tabId])
  
  // Initial fetch - re-fetch when tabSources or tabId change
  useEffect(() => {
    const sourcesChanged = previousTabSourcesKeyRef.current !== tabSourcesKey
    const isInitialMount = previousTabSourcesKeyRef.current === null
    
    // Update previous key
    previousTabSourcesKeyRef.current = tabSourcesKey
    
    // Refs are already updated by the previous useEffect, but ensure they're current
    // (The previous useEffect runs first due to React's effect ordering)
    
    // Clear news immediately when tab or sources change
    setNews([])
    setLoading(true)
    setIsInitialLoad(isInitialMount)
    setError(null)
    // Reset fetching flag
    isFetchingRef.current = false
    
    // CRITICAL: Don't fetch if we don't know which tab we're on yet
    // This prevents fetching with default sources when the active tab hasn't been determined yet
    // On page refresh, we need to wait for the active tab to be determined from URL/localStorage
    if (isInitialMount && tabId === null) {
      setLoading(false)
      setIsInitialLoad(false)
      return // Don't fetch yet - wait for tab to be set
    }
    
    // Now we know which tab we're on (tabId is set)
    // Determine which sources to use:
    // - If tabSources is provided and has items, use those
    // - If tabSources is an empty array (tab exists but has no sources), show empty state
    // - Only use default sources if tabSources is null/undefined AND we're not on initial mount
    //   (this handles edge cases, but should rarely happen)
    const hasTabSources = tabSources && Array.isArray(tabSources)
    const hasSources = hasTabSources && tabSources.length > 0
    
    let sourcesToUse = null
    if (hasSources) {
      // Tab has sources - use them
      sourcesToUse = tabSources
    } else if (hasTabSources && tabSources.length === 0) {
      // Tab exists but has no sources - show empty state
      setNews([])
      setLoading(false)
      setIsInitialLoad(false)
      saveNewsToCache([], tabId)
      return
    } else {
      // tabSources is null/undefined - this shouldn't happen if tabId is set, but handle it
      console.warn('[News Feed] tabSources is null/undefined but tabId is set. TabId:', tabId)
      console.warn('[News Feed] This might indicate a timing issue. Waiting...')
      setLoading(false)
      setIsInitialLoad(false)
      return
    }
    
    const cachedNews = loadCachedNews(sourcesToUse, tabId)
    
    // If sources changed (added/removed), always force refresh with toast
    if (sourcesChanged) {
      // Sources changed - force refresh with toast
      // Initialize previousNewsIdsRef with cached article IDs before refresh
      // This ensures we only highlight articles that are truly new
      if (cachedNews && cachedNews.length > 0) {
        previousNewsIdsRef.current = loadCachedArticleIds(tabId)
      }
      fetchNewsInternal(false, true, true) // forceRefresh=true, showToast=true
    } else if (cachedNews && cachedNews.length > 0 && !isInitialMount) {
      // No change, use cache and fetch in background
      setNews(cachedNews)
      // Initialize previousNewsIdsRef with cached article IDs from localStorage
      // This ensures we can detect truly new articles even after page refresh
      previousNewsIdsRef.current = loadCachedArticleIds(tabId)
      setLoading(false)
      setIsInitialLoad(false)
      setTimeout(() => {
        fetchNewsInternal(false, false, false)
      }, 100)
    } else {
      // Initial mount or no cache - fetch with toast
      // On initial mount, initialize previousNewsIdsRef from cache if available
      if (cachedNews && cachedNews.length > 0) {
        previousNewsIdsRef.current = loadCachedArticleIds(tabId)
      }
      fetchNewsInternal(true, false, true)
    }
  }, [tabId, tabSourcesKey, fetchNewsInternal])

  // Handle network reconnection after sleep/offline
  // This fixes the issue where refresh doesn't work after computer wakes from sleep
  useEffect(() => {
    const handleOnline = () => {
      console.log('[News Feed] Network reconnected, resetting fetch lock')
      // Reset the fetching flag in case it got stuck
      isFetchingRef.current = false
      // Auto-refresh news after reconnection (but only if we have cached news)
      if (news.length > 0) {
        console.log('[News Feed] Auto-refreshing after reconnection...')
        fetchNewsInternal(false, true, false) // Force refresh without toast
      }
    }
    
    const handleVisibilityChange = () => {
      // When tab becomes visible again after being hidden (e.g., after sleep)
      if (!document.hidden) {
        console.log('[News Feed] Tab became visible, resetting fetch lock')
        isFetchingRef.current = false
      }
    }
    
    window.addEventListener('online', handleOnline)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    
    return () => {
      window.removeEventListener('online', handleOnline)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [fetchNewsInternal, news.length])

  return {
    news,
    loading,
    error,
    isInitialLoad,
    newItemIds,
    fetchNews,
    refreshNews: () => {
      // Always reset the fetching flag before manual refresh
      // This ensures refresh works even if the flag got stuck
      isFetchingRef.current = false
      return fetchNews(true, true)
    }
  }
}
