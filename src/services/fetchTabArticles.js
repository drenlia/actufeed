/**
 * Fetch all RSS sources for one tab (same batching as useNews) and return processed articles.
 * Caller handles cache persistence and toasts.
 */
import { fetchRssFeed, createRssBatchId, notifyRssBatchComplete } from './rssService'
import { calculatePopularityScores } from '../utils/popularityUtils'
import { loadCachedNews } from '../utils/storageUtils'

const BATCH_SIZE = 50
const BATCH_DELAY = 2000

/**
 * @param {Array} sourcesToFetch
 * @param {string} tabId
 * @returns {Promise<{
 *   news: Array,
 *   failedFeeds: Array,
 *   successfulFeeds: Array,
 *   diskCacheForFailure: Array|null,
 *   rssBatchId: string|null
 * }>}
 */
export async function fetchTabArticles(sourcesToFetch, tabId) {
  const failedFeeds = []
  const successfulFeeds = []
  let rssBatchId = null

  if (!sourcesToFetch || sourcesToFetch.length === 0) {
    return {
      news: [],
      failedFeeds,
      successfulFeeds,
      diskCacheForFailure: null,
      rssBatchId: null,
    }
  }

  rssBatchId = createRssBatchId()
  const allNews = []
  const batches = []
  for (let i = 0; i < sourcesToFetch.length; i += BATCH_SIZE) {
    batches.push(sourcesToFetch.slice(i, i + BATCH_SIZE))
  }

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex]
    const batchPromises = batch.map((source) => fetchRssFeed(source, { batchId: rssBatchId }))
    const batchResults = await Promise.allSettled(batchPromises)

    const normalizedResults = batchResults.map((result, idx) => {
      if (result.status === 'fulfilled') {
        return result.value
      }
      const source = batch[idx]
      const sourceName = source?.name || (typeof source === 'string' ? source : 'Unknown')
      return {
        news: [],
        error: {
          name: sourceName,
          message: result.reason?.message || 'Failed to fetch feed',
          status: 500,
        },
      }
    })

    for (let index = 0; index < normalizedResults.length; index++) {
      const result = normalizedResults[index]
      const source = batch[index]
      const sourceName = source?.name || (typeof source === 'string' ? source : 'Unknown')

      if (!result || typeof result !== 'object') {
        failedFeeds.push({
          name: sourceName,
          status: 500,
          message: 'Invalid response format',
        })
        continue
      }

      const { news: sourceNews, error: sourceError } = result

      if (!Array.isArray(sourceNews)) {
        if (sourceError) {
          failedFeeds.push({
            name: sourceName,
            status: sourceError.status || 500,
            message: sourceError.message || 'Invalid response format',
          })
        } else {
          failedFeeds.push({
            name: sourceName,
            status: 500,
            message: 'Invalid response format',
          })
        }
        continue
      }

      if (sourceError) {
        failedFeeds.push({
          name: sourceName,
          status: sourceError.status,
          message: sourceError.message,
        })
      } else {
        allNews.push(...sourceNews)
        successfulFeeds.push({
          name: sourceName,
          articleCount: sourceNews.length,
        })
      }
    }

    if (batchIndex < batches.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY))
    }
  }

  let diskCacheForFailure = null
  if (allNews.length === 0 && failedFeeds.length > 0) {
    const disk = loadCachedNews(sourcesToFetch, tabId)
    if (disk && disk.length > 0) {
      diskCacheForFailure = disk
    }
  }

  const newsWithScores = calculatePopularityScores(allNews)
  newsWithScores.sort((a, b) => {
    const dateA = a.publishedAt.getTime()
    const dateB = b.publishedAt.getTime()
    if (isNaN(dateA) && isNaN(dateB)) return 0
    if (isNaN(dateA)) return 1
    if (isNaN(dateB)) return -1
    return dateB - dateA
  })

  const sourceNames = new Set(
    sourcesToFetch
      .map((s) => {
        const name = s?.name || (typeof s === 'string' ? '' : s.name)
        return name ? name.trim() : ''
      })
      .filter((n) => n.length > 0)
  )

  let filteredFinal = newsWithScores
  if (sourceNames.size > 0) {
    filteredFinal = newsWithScores.filter((item) => {
      const itemSource = item.source ? item.source.trim() : ''
      return itemSource && sourceNames.has(itemSource)
    })
  }

  let newsOut = filteredFinal
  if (filteredFinal.length === 0 && failedFeeds.length > 0 && diskCacheForFailure) {
    newsOut = diskCacheForFailure
  }

  if (rssBatchId) {
    notifyRssBatchComplete(rssBatchId)
  }

  return {
    /** Display list (may be disk fallback). */
    news: newsOut,
    /** Network result before disk overlay — use for cache save rules (matches useNews). */
    networkFiltered: filteredFinal,
    failedFeeds,
    successfulFeeds,
    diskCacheForFailure,
    rssBatchId,
  }
}
