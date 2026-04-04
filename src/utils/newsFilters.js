import { normalizeCategory } from './categoryUtils'
import { getSearchableText } from './locationUtils'

// Filter news based on all selected filters
export const filterNews = (news, filters, combinedCategories) => {
  const {
    newsFilter,
    showHighlyRated,
    searchQuery,
    selectedCategories,
    sourceNameFilter = '',
    minPopularityScore = null,
  } = filters

  return news.filter(item => {
    // Language filter
    if (newsFilter !== 'all' && item.language !== newsFilter) {
      return false
    }

    const outlet = typeof sourceNameFilter === 'string' ? sourceNameFilter.trim() : ''
    if (outlet) {
      const itemSource = (item.source || '').trim()
      if (itemSource !== outlet) {
        return false
      }
    }

    if (minPopularityScore != null && minPopularityScore > 0) {
      const score = item.popularityScore || 0
      if (score < minPopularityScore) {
        return false
      }
    }

    // Highly rated filter
    if (showHighlyRated) {
      const score = item.popularityScore || 0
      if (score <= 15) {
        return false
      }
    }
    
    // Enhanced text search - searches across keyword, outlet, city, province, country, etc.
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      const searchableText = getSearchableText(item)
      
      // Check if query matches any part of the searchable text
      if (!searchableText.includes(query)) {
        return false
      }
    }
    
    // Category filter (multi-select)
    if (selectedCategories.size > 0) {
      if (!item.categories || item.categories.length === 0) {
        return false
      }
      const itemCategoryNormalized = item.categories.map(cat => normalizeCategory(cat))
      const hasMatch = itemCategoryNormalized.some(catNorm => {
        return Array.from(selectedCategories).some(selectedDisplayName => {
          const selectedCat = combinedCategories.find(c => c.displayName === selectedDisplayName)
          if (selectedCat) {
            return catNorm === selectedCat.normalized
          }
          const selectedNorm = normalizeCategory(selectedDisplayName)
          return catNorm === selectedNorm
        })
      })
      return hasMatch
    }
    
    return true
  })
}

// Sort news by date or popularity
export const sortNews = (news, sortBy) => {
  return [...news].sort((a, b) => {
    if (sortBy === 'popularity') {
      const scoreA = a.popularityScore || 0
      const scoreB = b.popularityScore || 0
      if (scoreB !== scoreA) {
        return scoreB - scoreA
      }
    }
    
    const dateA = a.publishedAt.getTime()
    const dateB = b.publishedAt.getTime()
    
    if (isNaN(dateA) && isNaN(dateB)) return 0
    if (isNaN(dateA)) return 1
    if (isNaN(dateB)) return -1
    
    return dateB - dateA
  })
}
