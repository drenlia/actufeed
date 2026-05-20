import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { fetchTabArticles } from '../services/fetchTabArticles'
import { saveNewsToCache, loadCachedNews, loadCachedArticleIds } from '../utils/storageUtils'
import { useToastContext } from '../contexts/ToastContext'

/** Mutable queue + lock for serialized refresh passes (mounted on a Ref). */
function createQueuedRefreshGate() {
  return {
    locked: false,
    pendingUserPass: false,
    pendingSilentPass: false,
  }
}

/**
 * Fetch and cache news for every tab: active tab first, then other tabs in the background.
 * Refreshes are serialized; overlapping triggers queue at most one extra full pass (user wins priority).
 */
export function useMultiTabNews(tabs, activeTabId, showToastMessages) {
  const [newsByTabId, setNewsByTabId] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [feedFetchHadFailures, setFeedFetchHadFailures] = useState(false)
  const [isInitialLoad, setIsInitialLoad] = useState(true)
  const [newItemIds, setNewItemIds] = useState(new Set())

  const gateRef = useRef(createQueuedRefreshGate())
  /** @type {import('react').MutableRefObject<((v: boolean) => void) | null>} */
  const setLoadingRef = useRef(setLoading)

  setLoadingRef.current = setLoading

  const tabsRef = useRef(tabs)
  const activeTabIdRef = useRef(activeTabId)

  tabsRef.current = tabs
  activeTabIdRef.current = activeTabId

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

  const applyNewItemsForActive = useCallback((tabId, newsOut) => {
    if (tabId !== activeTabIdRef.current) return
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
  }, [])

  const fetchOneTab = useCallback(
    async (tabId, { isPriority = false, showToast = false } = {}) => {
      const tab = tabsRef.current.find((t) => t.id === tabId)
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
      if (tabId === activeTabIdRef.current) {
        setFeedFetchHadFailures(feedEmpty)
      }

      if (
        isPriority &&
        showToast &&
        showToastMessages &&
        result.diskCacheForFailure &&
        failedFeeds.length > 0
      ) {
        toastRef.current.warning('Could not refresh feeds. Showing saved articles from this tab.', 8000)
      }
    },
    [persistTabNews, applyNewItemsForActive, showToastMessages],
  )

  const refreshAllTabsNetworkPass = useCallback(
    async (showToastOnActiveTab) => {
      setError(null)
      const tList = tabsRef.current || []
      const actId = activeTabIdRef.current
      for (const t of tList) {
        const src = t.sources || []
        if (!src.length) continue
        await fetchOneTab(t.id, {
          isPriority: t.id === actId,
          showToast: !!showToastOnActiveTab && t.id === actId,
        })
      }
    },
    [fetchOneTab],
  )

  /**
   * Serialized refresh: drains optional queued passes. Sets loading=true for the locked region only.
   * @returns {'queued' | 'started'} queued = another run holds the gate; hooks must not toggle loading here.
   */
  const enqueueOrExecuteExclusiveRefreshSession = useCallback(
    /** @returns {Promise<'queued' | 'started'>} */
    async (firstPassToast, meta, runner) => {
      const gate = gateRef.current
      const userTriggered = meta.userTriggered ?? false

      if (gate.locked) {
        if (firstPassToast || userTriggered) gate.pendingUserPass = true
        else gate.pendingSilentPass = true
        return 'queued'
      }

      gate.locked = true
      setLoadingRef.current(true)

      /** @type {boolean} */
      let showToastActive = !!firstPassToast

      try {
        let passAgain = false
        do {
          passAgain = false
          await runner(showToastActive)
          const wantUser = gate.pendingUserPass
          const wantSilent = gate.pendingSilentPass
          gate.pendingUserPass = false
          gate.pendingSilentPass = false
          if (wantUser) {
            showToastActive = true
            passAgain = true
          } else if (wantSilent) {
            showToastActive = false
            passAgain = true
          }
        } while (passAgain)
      } finally {
        gate.locked = false
        setLoadingRef.current(false)
      }
      return 'started'
    },
    [],
  )

  /** Initial / tabs-changed: hydrate from disk first (always), then serialized network passes */
  const runLoadSequence = useCallback(
    async (showToastForActive) => {
      const tabsList = tabsRef.current || []
      const actId = activeTabIdRef.current

      if (!tabsList?.length || !actId) {
        setLoading(false)
        setIsInitialLoad(false)
        return
      }

      const activeTab = tabsList.find((t) => t.id === actId)
      if (!(activeTab?.sources || []).length) {
        setFeedFetchHadFailures(false)
        setLoading(false)
        setIsInitialLoad(false)
        return
      }

      const next = {}
      for (const t of tabsList) {
        const src = t.sources || []
        if (src.length) {
          const c = loadCachedNews(src, t.id)
          if (c?.length) next[t.id] = c
        }
      }
      if (Object.keys(next).length) {
        setNewsByTabId((prev) => ({ ...prev, ...next }))
        const prevActive = next[actId]
        if (prevActive?.length) {
          previousNewsIdsRef.current = loadCachedArticleIds(actId)
        }
      }

      setIsInitialLoad(false)

      await enqueueOrExecuteExclusiveRefreshSession(
        !!showToastForActive,
        { userTriggered: false },
        refreshAllTabsNetworkPass,
      )
    },
    [enqueueOrExecuteExclusiveRefreshSession, refreshAllTabsNetworkPass],
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
      void runLoadSequence(true)
    }
  }, [tabsKey, tabs?.length, activeTabId, runLoadSequence])

  useEffect(() => {
    if (!activeTabId) return
    previousNewsIdsRef.current = loadCachedArticleIds(activeTabId)
  }, [activeTabId])

  const fetchNews = useCallback(
    async (useCache = true, forceRefresh = false) => {
      const actId = activeTabIdRef.current
      if (!actId) return
      const activeTab = tabsRef.current?.find((t) => t.id === actId)
      const sources = activeTab?.sources || []
      if (!sources.length) return

      if (useCache && !forceRefresh) {
        const cached = loadCachedNews(sources, actId)
        if (cached?.length) {
          setNewsByTabId((prev) => ({ ...prev, [actId]: cached }))
          previousNewsIdsRef.current = new Set(cached.map((i) => i.id))
          setLoading(false)
          setTimeout(() => {
            void enqueueOrExecuteExclusiveRefreshSession(false, { userTriggered: false }, refreshAllTabsNetworkPass)
          }, 100)
          return
        }
      }

      setError(null)
      await enqueueOrExecuteExclusiveRefreshSession(true, { userTriggered: true }, refreshAllTabsNetworkPass)
    },
    [enqueueOrExecuteExclusiveRefreshSession, refreshAllTabsNetworkPass],
  )

  /**
   * @param {{ userTriggered?: boolean }} [options]
   * `userTriggered: true` — default — priority-tab toasts permitted on first pass(es).
   */
  const refreshNews = useCallback(
    async (options = {}) => {
      const userTriggered = options.userTriggered !== false
      setError(null)
      await enqueueOrExecuteExclusiveRefreshSession(userTriggered, { userTriggered }, refreshAllTabsNetworkPass)
    },
    [enqueueOrExecuteExclusiveRefreshSession, refreshAllTabsNetworkPass],
  )

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
