import categoriesData from '../categories.json'

// Load categories from localStorage or default JSON
export const loadCategories = () => {
  try {
    const stored = localStorage.getItem('newsfeed-categories')
    if (stored) {
      const parsed = JSON.parse(stored)
      const cats = parsed.categories || { en: [], fr: [] }
      return { categories: cats, lastUpdated: parsed.lastUpdated }
    }
  } catch (err) {
    console.warn('Failed to load categories from localStorage:', err)
  }
  // Fallback to imported JSON or empty
  const defaultCats = categoriesData?.categories || { en: [], fr: [] }
  return { categories: defaultCats, lastUpdated: null }
}

// Save categories to localStorage
export const saveCategories = (cats) => {
  try {
    const data = {
      categories: cats,
      lastUpdated: new Date().toISOString()
    }
    localStorage.setItem('newsfeed-categories', JSON.stringify(data))
    
    // Note: In a browser environment, we can't directly write to files
    // The categories.json will be updated via localStorage
    // For production, you'd need a backend API to sync this
    return data
  } catch (err) {
    console.error('Failed to save categories:', err)
    // If localStorage is full, try to clear old cache
    try {
      localStorage.removeItem('newsfeed-categories')
      const data = {
        categories: cats,
        lastUpdated: new Date().toISOString()
      }
      localStorage.setItem('newsfeed-categories', JSON.stringify(data))
      return data
    } catch (e) {
      console.error('Failed to clear and save cache:', e)
      return null
    }
  }
}

// Bump when article shape changes (e.g. descriptionFull for expand). Invalidates old caches.
export const NEWS_CACHE_SCHEMA_VERSION = 5

// Load cached news from localStorage
// Now supports tab-aware caching with tabId parameter
export const loadCachedNews = (currentSources = null, tabId = null) => {
  try {
    // If tabId is provided, use tab-specific cache
    if (tabId) {
      const tabCacheKey = `newsfeed-cache-tab-${tabId}`
      const cached = localStorage.getItem(tabCacheKey)
      if (cached) {
        const parsed = JSON.parse(cached)
        if (parsed.schemaVersion !== NEWS_CACHE_SCHEMA_VERSION) {
          return null
        }
        if (parsed.news && parsed.news.length > 0) {
          // Convert date strings back to Date objects
          let newsWithDates = parsed.news.map(item => ({
            ...item,
            publishedAt: new Date(item.publishedAt)
          }))
          
          // Filter by current sources if provided (removes articles from deleted sources)
          // Match by source name only (item.source contains the source name)
          if (currentSources && currentSources.length > 0) {
            const sourceNames = new Set(currentSources.map(s => {
              const name = s.name || (typeof s === 'string' ? '' : s.name)
              return name ? name.trim() : ''
            }).filter(n => n.length > 0))
            
            if (sourceNames.size > 0) {
              newsWithDates = newsWithDates.filter(item => {
                const itemSource = item.source ? item.source.trim() : ''
                return itemSource && sourceNames.has(itemSource)
              })
            } else {
              // No valid source names, return empty
              return []
            }
          } else {
            // If no sources provided, return empty array (all sources were removed)
            return []
          }
          
          return newsWithDates
        }
      }
      return null
    }
    
    // Fallback to legacy cache (for backward compatibility)
    const cached = localStorage.getItem('newsfeed-cache')
    if (cached) {
      const parsed = JSON.parse(cached)
      if (parsed.schemaVersion !== NEWS_CACHE_SCHEMA_VERSION) {
        return null
      }
      if (parsed.news && parsed.news.length > 0) {
        // Convert date strings back to Date objects
        let newsWithDates = parsed.news.map(item => ({
          ...item,
          publishedAt: new Date(item.publishedAt)
        }))
        
        // Filter by current sources if provided (removes articles from deleted sources)
        if (currentSources && currentSources.length > 0) {
          const sourceNames = new Set(currentSources.map(s => s.name || (typeof s === 'string' ? '' : s.name)))
          newsWithDates = newsWithDates.filter(item => sourceNames.has(item.source))
        }
        
        return newsWithDates
      }
    }
  } catch (err) {
    console.warn('Failed to load cached news:', err)
  }
  return null
}

// Clear cached news (optionally for a specific tab)
export const clearCachedNews = (tabId = null) => {
  try {
    if (tabId) {
      // Clear specific tab cache
      localStorage.removeItem(`newsfeed-cache-tab-${tabId}`)
    } else {
      // Clear all tab caches and legacy cache
      localStorage.removeItem('newsfeed-cache')
      // Clear all tab-specific caches
      const keys = Object.keys(localStorage)
      keys.forEach(key => {
        if (key.startsWith('newsfeed-cache-tab-')) {
          localStorage.removeItem(key)
        }
      })
    }
    return true
  } catch (err) {
    console.warn('Failed to clear cached news:', err)
    return false
  }
}

// Save news to cache (now supports tab-aware caching)
export const saveNewsToCache = (newsData, tabId = null) => {
  try {
    // Extract article IDs for tracking "new" articles
    const articleIds = newsData.map(item => item.id)
    const cacheData = {
      news: newsData,
      articleIds: articleIds, // Store IDs separately for quick access
      timestamp: Date.now(),
      schemaVersion: NEWS_CACHE_SCHEMA_VERSION,
    }
    
    if (tabId) {
      // Save to tab-specific cache
      const tabCacheKey = `newsfeed-cache-tab-${tabId}`
      localStorage.setItem(tabCacheKey, JSON.stringify(cacheData))
    } else {
      // Fallback to legacy cache
      localStorage.setItem('newsfeed-cache', JSON.stringify(cacheData))
    }
  } catch (err) {
    console.warn('Failed to save news to cache:', err)
    // If localStorage is full, try to clear old cache
    try {
      const articleIds = newsData.map(item => item.id)
      if (tabId) {
        localStorage.removeItem(`newsfeed-cache-tab-${tabId}`)
        const cacheData = {
          news: newsData,
          articleIds: articleIds,
          timestamp: Date.now(),
          schemaVersion: NEWS_CACHE_SCHEMA_VERSION,
        }
        localStorage.setItem(`newsfeed-cache-tab-${tabId}`, JSON.stringify(cacheData))
      } else {
        localStorage.removeItem('newsfeed-cache')
        const cacheData = {
          news: newsData,
          articleIds: articleIds,
          timestamp: Date.now(),
          schemaVersion: NEWS_CACHE_SCHEMA_VERSION,
        }
        localStorage.setItem('newsfeed-cache', JSON.stringify(cacheData))
      }
    } catch (e) {
      console.error('Failed to clear and save cache:', e)
    }
  }
}

// Load cached article IDs (for tracking new articles across page refreshes)
export const loadCachedArticleIds = (tabId = null) => {
  try {
    if (tabId) {
      const tabCacheKey = `newsfeed-cache-tab-${tabId}`
      const cached = localStorage.getItem(tabCacheKey)
      if (cached) {
        const parsed = JSON.parse(cached)
        if (parsed.articleIds && Array.isArray(parsed.articleIds)) {
          return new Set(parsed.articleIds)
        }
      }
    } else {
      // Fallback to legacy cache
      const cached = localStorage.getItem('newsfeed-cache')
      if (cached) {
        const parsed = JSON.parse(cached)
        if (parsed.articleIds && Array.isArray(parsed.articleIds)) {
          return new Set(parsed.articleIds)
        }
      }
    }
  } catch (err) {
    console.warn('Failed to load cached article IDs:', err)
  }
  return new Set()
}
