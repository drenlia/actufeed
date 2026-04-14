import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { fetchTabArticles } from '../services/fetchTabArticles'
import { saveNewsToCache, loadCachedNews, loadCachedArticleIds } from '../utils/storageUtils'
import { useToastContext } from '../contexts/ToastContext'

/**
 * Fetch and cache news for every tab: active tab first, then other tabs in the background.
 */
export function useMultiTabNews(tabs, activeTabId, showToastMessages) {
  const [newsByTabId, setNewsByTabId] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [feedFetchHadFailures, setFeedFetchHadFailures] = useState(false)
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  const [newItemIds, setNewItemIds] = useState(new Set())

  const previousNewsIdsRef = useRef(new Set())
  const toastRef = useRef(null)
  const { warning } = useToastContext()
  toastRef.current = { warning }

  const tabsKey = useMemo(() => {
    if (!tabs?.length) return ''
    return tabs
      .map((t) => `${t.id}:${(t.sources || []).map((s) => `${s?.name || ''}:${s?.url || ''}`).join('|')}`)
      .join('||')
  }, [tabs])

  const news = useMemo(() => {
    if (!activeTabId) return []
    return newsByTabId[activeTabId] ?? []
  }, [newsByTabId, activeTabId])

  const persistTabNews = useCallback((tabId, networkFiltered, failedFeeds, newsOut) => {
    if (failedFeeds.length === 0 || networkFiltered.length > 0) {
      saveNewsToCache(networkFiltered.length > 0 ? networkFiltered : [], tabId)
    }
    setNewsByTabId((prev) => ({ ...prev, [tabId]: newsOut }))
  }, [])

  const applyNewItemsForActive = useCallback(
    (tabId, newsOut) => {
      if (tabId !== activeTabId) return
      const previousIds = previousNewsIdsRef.current
      const newIds = new Set()
      newsOut.forEach((item) => {
        if (!previousIds.has(item.id)) newIds.add(item.id)
      })
      if (newIds.size > 0) {
        setNewItemIds(newIds)
        setTimeout(() => setNewItemIds(new Set()), 3000)
      }
      previousNewsIdsRef.current = new Set(newsOut.map((i) => i.id))
    },
    [activeTabId]
  )

  const fetchOneTab = useCallback(
    async (tabId, { isPriority = false, showToast = false } = {}) => {
      const tab = tabs.find((t) => t.id === tabId)
      const sources = tab?.sources || []
      if (sources.length === 0) {
        setNewsByTabId((prev) => ({ ...prev, [tabId]: [] }))
        saveNewsToCache([], tabId)
        return
      }

      const result = await fetchTabArticles(sources, tabId)
      const { news, networkFiltered, failedFeeds, successfulFeeds } = result

      persistTabNews(tabId, networkFiltered, failedFeeds, news)
      applyNewItemsForActive(tabId, news)

      const feedEmpty =
        news.length === 0 && failedFeeds.length > 0 && successfulFeeds.length === 0
      if (tabId === activeTabId) {
        setFeedFetchHadFailures(feedEmpty)
      }

      if (isPriority && showToast && showToastMessages && result.diskCacheForFailure && failedFeeds.length > 0) {
        toastRef.current.warning('Could not refresh feeds. Showing saved articles from this tab.', 8000)
      }
    },
    [tabs, persistTabNews, applyNewItemsForActive, activeTabId, showToastMessages]
  )

  const runLoadSequence = useCallback(
    async (showToastForActive) => {
      if (!tabs?.length || !activeTabId) {
        setLoading(false)
        setIsInitialLoad(false)
        return
      }

      const next = {}
      for (const t of tabs) {
        const src = t.sources || []
        if (src.length) {
          const c = loadCachedNews(src, t.id)
          if (c?.length) next[t.id] = c
        }
      }
      if (Object.keys(next).length) {
        setNewsByTabId((prev) => ({ ...prev, ...next }))
        const prevActive = next[activeTabId]
        if (prevActive?.length) {
          previousNewsIdsRef.current = loadCachedArticleIds(activeTabId)
        }
      }

      const activeTab = tabs.find((t) => t.id === activeTabId)
      const hasSources = (activeTab?.sources || []).length > 0
      if (hasSources && !next[activeTabId]?.length) {
        setLoading(true)
      } else {
        setLoading(false)
      }
      setError(null)

      if (!hasSources) {
        setFeedFetchHadFailures(false)
        setLoading(false)
        setIsInitialLoad(false)
        return
      }

      await fetchOneTab(activeTabId, { isPriority: true, showToast: showToastForActive })
      setLoading(false)
      setIsInitialLoad(false)

      for (const t of tabs) {
        if (t.id === activeTabId) continue
        const src = t.sources || []
        if (!src.length) continue
        await fetchOneTab(t.id, { isPriority: false, showToast: false })
      }
    },
    [tabs, activeTabId, fetchOneTab]
  )

  const prevTabsKeyRef = useRef(null)
  useEffect(() => {
    if (!tabs?.length || !activeTabId) {
      setLoading(false)
      setIsInitialLoad(false)
      return
    }

    const isFirst = prevTabsKeyRef.current === null
    const tabsChanged = prevTabsKeyRef.current !== null && prevTabsKeyRef.current !== tabsKey
    prevTabsKeyRef.current = tabsKey

    if (isFirst || tabsChanged) {
      runLoadSequence(true)
    }
  }, [tabsKey, tabs?.length, activeTabId, runLoadSequence])

  useEffect(() => {
    if (!activeTabId) return
    previousNewsIdsRef.current = loadCachedArticleIds(activeTabId)
  }, [activeTabId])

  const fetchNews = useCallback(
    async (useCache = true, forceRefresh = false) => {
      if (!activeTabId) return
      const activeTab = tabs.find((t) => t.id === activeTabId)
      const sources = activeTab?.sources || []
      if (!sources.length) return

      if (useCache && !forceRefresh) {
        const cached = loadCachedNews(sources, activeTabId)
        if (cached?.length) {
          setNewsByTabId((prev) => ({ ...prev, [activeTabId]: cached }))
          previousNewsIdsRef.current = new Set(cached.map((i) => i.id))
          setLoading(false)
          setTimeout(() => {
            fetchOneTab(activeTabId, { isPriority: true, showToast: false })
          }, 100)
          return
        }
      }

      setLoading(true)
      setError(null)
      await fetchOneTab(activeTabId, { isPriority: true, showToast: true })
      setLoading(false)
    },
    [activeTabId, tabs, fetchOneTab]
  )

  const refreshNews = useCallback(async () => {
    setLoading(true)
    setError(null)
    for (const t of tabs) {
      const src = t.sources || []
      if (!src.length) continue
      await fetchOneTab(t.id, { isPriority: t.id === activeTabId, showToast: t.id === activeTabId })
    }
    setLoading(false)
  }, [tabs, activeTabId, fetchOneTab])

  return {
    news,
    newsByTabId,
    loading,
    error,
    feedFetchHadFailures,
    isInitialLoad,
    newItemIds,
    fetchNews,
    refreshNews,
  }
}
