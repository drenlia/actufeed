// Service to search for news sources by any field (name, city, country, province, etc.)
import cityNewsData from '../data/cityNewsOutlets.json'

// Country code to country name mapping
const COUNTRY_NAMES = {
  'CA': 'Canada',
  'US': 'United States',
  'AU': 'Australia',
  'GB': 'United Kingdom',
  'FR': 'France',
  'DE': 'Germany',
  'IT': 'Italy',
  'ES': 'Spain',
  'JP': 'Japan',
  'IN': 'India',
  'BR': 'Brazil',
  'MX': 'Mexico',
  'RU': 'Russia',
  'CN': 'China',
  'BD': 'Bangladesh',
  'ID': 'Indonesia',
  'IR': 'Iran',
  'IE': 'Ireland',
  'MM': 'Myanmar',
  'NG': 'Nigeria',
  'PK': 'Pakistan',
  'PH': 'Philippines',
  'PL': 'Poland',
  'ZA': 'South Africa',
  'UA': 'Ukraine',
  'HK': 'Hong Kong',
}

/**
 * Search for sources matching a query
 * Searches in: outlet name, city name, country, province, URL
 * @param {string} query - Search query
 * @param {Set} countryFilters - Set of country codes to filter by (optional)
 * @returns {Array} Array of matching sources with metadata
 */
export const searchSources = (query, countryFilters = null) => {
  if (!query || query.trim().length < 1) {
    return []
  }

  const searchTerm = query.toLowerCase().trim()
  const results = []

  // Search through all cities/regions in the database
  Object.entries(cityNewsData.cities).forEach(([cityKey, cityData]) => {
    const countryName = COUNTRY_NAMES[cityData.country] || cityData.country
    const province = cityData.province || ''
    
    // Check if city/region matches
    const cityMatches = cityKey.toLowerCase().includes(searchTerm)
    const countryMatches = countryName.toLowerCase().includes(searchTerm)
    const provinceMatches = province.toLowerCase().includes(searchTerm)
    
    // Search through outlets in this city/region
    cityData.outlets.forEach(outlet => {
      const nameMatches = outlet.name.toLowerCase().includes(searchTerm)
      const urlMatches = outlet.url.toLowerCase().includes(searchTerm)
      const typeMatches = (outlet.type || '').toLowerCase().includes(searchTerm)
      const languageMatches = (outlet.language || '').toLowerCase().includes(searchTerm)
      
      // If any field matches, include this source
      if (nameMatches || urlMatches || cityMatches || countryMatches || 
          provinceMatches || typeMatches || languageMatches) {
        // Check if already in results (avoid duplicates)
        const exists = results.some(r => r.url === outlet.url)
        if (!exists) {
          results.push({
            name: outlet.name,
            url: outlet.url,
            language: outlet.language || 'en',
            type: outlet.type || 'online',
            region: cityKey, // City name or country name
            country: countryName,
            countryCode: cityData.country,
            province: province,
            // Add match reasons for highlighting
            matchReasons: {
              name: nameMatches,
              city: cityMatches,
              country: countryMatches,
              province: provinceMatches,
              url: urlMatches
            }
          })
        }
      }
    })
  })

  // Filter by country if filters are provided
  let filteredResults = results
  if (countryFilters && countryFilters.size > 0) {
    filteredResults = results.filter(r => countryFilters.has(r.countryCode))
  }

  // Sort by relevance (exact name matches first, then city matches, then others)
  filteredResults.sort((a, b) => {
    // Exact name match gets highest priority
    const aNameExact = a.name.toLowerCase() === searchTerm
    const bNameExact = b.name.toLowerCase() === searchTerm
    if (aNameExact && !bNameExact) return -1
    if (!aNameExact && bNameExact) return 1
    
    // Name starts with query
    const aNameStarts = a.name.toLowerCase().startsWith(searchTerm)
    const bNameStarts = b.name.toLowerCase().startsWith(searchTerm)
    if (aNameStarts && !bNameStarts) return -1
    if (!aNameStarts && bNameStarts) return 1
    
    // City matches
    if (a.matchReasons.city && !b.matchReasons.city) return -1
    if (!a.matchReasons.city && b.matchReasons.city) return 1
    
    // Alphabetical by name
    return a.name.localeCompare(b.name)
  })

  return filteredResults
}

/** Must cover all outlets in cityNewsOutlets.json (order is JSON key order; a low cap hides later regions e.g. Montreal). */
export const CATALOG_BROWSE_LIMIT = 2000

/**
 * Get all available sources (for browsing when no search query)
 * @param {number} limit - Maximum number of sources to return (default: CATALOG_BROWSE_LIMIT)
 * @param {Set} countryFilters - Set of country codes to filter by (optional)
 * @returns {Array} Array of all sources
 */
export const getAllSources = (limit = CATALOG_BROWSE_LIMIT, countryFilters = null) => {
  const allSources = []
  
  Object.entries(cityNewsData.cities).forEach(([cityKey, cityData]) => {
    // Filter by country if filters are provided
    if (countryFilters && countryFilters.size > 0) {
      if (!countryFilters.has(cityData.country)) {
        return // Skip this country
      }
    }
    
    const countryName = COUNTRY_NAMES[cityData.country] || cityData.country
    
    cityData.outlets.forEach(outlet => {
      allSources.push({
        name: outlet.name,
        url: outlet.url,
        language: outlet.language || 'en',
        type: outlet.type || 'online',
        region: cityKey,
        country: countryName,
        countryCode: cityData.country,
        province: cityData.province || '',
      })
    })
  })
  
  return allSources.slice(0, limit)
}

/**
 * Get all available countries from the database
 * @returns {Array} Array of {code, name, count} objects
 */
export const getAllCountries = () => {
  const countryMap = new Map()
  
  Object.entries(cityNewsData.cities).forEach(([cityKey, cityData]) => {
    const countryCode = cityData.country
    const countryName = COUNTRY_NAMES[countryCode] || countryCode
    
    if (!countryMap.has(countryCode)) {
      countryMap.set(countryCode, {
        code: countryCode,
        name: countryName,
        count: 0
      })
    }
    
    // Count outlets for this country
    countryMap.get(countryCode).count += cityData.outlets.length
  })
  
  // Convert to array and sort by name
  return Array.from(countryMap.values())
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * Filter sources by country codes
 * @param {Array} sources - Array of source objects
 * @param {Set} countryFilters - Set of country codes to filter by
 * @returns {Array} Filtered sources
 */
export const filterSourcesByCountry = (sources, countryFilters) => {
  if (!countryFilters || countryFilters.size === 0) {
    return sources
  }
  
  return sources.filter(source => countryFilters.has(source.countryCode))
}

/**
 * Check if a source is currently active (in the config)
 * @param {string} sourceUrl - Source URL to check
 * @param {Array} activeSources - Array of active source objects
 * @returns {boolean}
 */
export const isSourceActive = (sourceUrl, activeSources) => {
  return activeSources.some(s => s.url === sourceUrl)
}
