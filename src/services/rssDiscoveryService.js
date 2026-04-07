// Service to discover RSS feeds for a given city
// Backend proxy is used instead of CORS proxies

import { apiUrl } from '../utils/apiBase'

// Known news sources by country/region (can be expanded)
const KNOWN_NEWS_DOMAINS = {
  'CA': [
    { name: 'CBC', pattern: 'cbc.ca', rssPattern: '/rss' },
    { name: 'CTV News', pattern: 'ctvnews.ca', rssPattern: '/rss' },
    { name: 'Global News', pattern: 'globalnews.ca', rssPattern: '/feed' },
    { name: 'The Globe and Mail', pattern: 'theglobeandmail.com', rssPattern: '/feed' },
    { name: 'National Post', pattern: 'nationalpost.com', rssPattern: '/feed' },
  ],
  'US': [
    { name: 'CNN', pattern: 'cnn.com', rssPattern: '/rss' },
    { name: 'BBC News', pattern: 'bbc.com', rssPattern: '/rss' },
    { name: 'Reuters', pattern: 'reuters.com', rssPattern: '/rss' },
    { name: 'Associated Press', pattern: 'apnews.com', rssPattern: '/feed' },
    { name: 'NPR', pattern: 'npr.org', rssPattern: '/rss' },
    { name: 'USA Today', pattern: 'usatoday.com', rssPattern: '/rss' },
  ],
  'FR': [
    { name: 'Le Monde', pattern: 'lemonde.fr', rssPattern: '/rss' },
    { name: 'Le Figaro', pattern: 'lefigaro.fr', rssPattern: '/rss' },
    { name: 'France 24', pattern: 'france24.com', rssPattern: '/rss' },
  ],
  'GB': [
    { name: 'BBC News', pattern: 'bbc.com', rssPattern: '/rss' },
    { name: 'The Guardian', pattern: 'theguardian.com', rssPattern: '/rss' },
    { name: 'Sky News', pattern: 'sky.com', rssPattern: '/rss' },
  ],
}

// Common RSS feed paths to try
const RSS_PATHS = [
  '/feed',
  '/rss',
  '/rss.xml',
  '/feed.xml',
  '/atom.xml',
  '/index.xml',
  '/news/feed',
  '/news/rss',
]

// Try to discover RSS feed from a domain (tries direct access first)
const tryDiscoverRss = async (baseUrl, sourceName) => {
  // Try common RSS paths
  for (const path of RSS_PATHS) {
    try {
      const testUrl = `${baseUrl}${path}`
      let response = null
      let text = null
      
      // Use backend proxy to avoid CORS issues
      try {
        const proxyUrl = apiUrl(`/api/proxy/rss?url=${encodeURIComponent(testUrl)}`)
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 5000)
        
        response = await fetch(proxyUrl, {
          signal: controller.signal,
          headers: {
            'Accept': 'application/rss+xml, application/xml, text/xml, */*'
          }
        })
        
        clearTimeout(timeoutId)
        
        if (response && response.ok) {
          text = await response.text()
        }
      } catch (error) {
        // Proxy failed, continue to next path
        continue
      }
      
      if (text) {
        // Basic validation - check if it looks like RSS/XML
        if (text.includes('<rss') || text.includes('<feed') || text.includes('<?xml')) {
          return {
            name: sourceName,
            url: testUrl,
            discovered: true
          }
        }
      }
    } catch (error) {
      // Continue to next path
      continue
    }
  }
  
  return null
}

// Discover RSS feeds for a city using multiple strategies
export const discoverRssFeedsForCity = async (city) => {
  const discoveredFeeds = []
  const cityName = city.name.toLowerCase()
  const normalizedCityName = city.name.split(',')[0].trim() // Remove state/province
  const country = city.country || ''
  const countryCode = getCountryCode(country)
  
  // Strategy 1: Use curated database of known news outlets
  const { getKnownOutletsForCity, getNationalFeedsForCountry } = await import('./cityNewsDatabase')
  
  // Get city-specific outlets (pass empty string to getNationalFeedsForCountry to avoid duplicates)
  const cityOutlets = getKnownOutletsForCity(normalizedCityName, countryCode)
  
  // Track city outlet URLs to avoid duplicates
  const cityOutletUrls = new Set(cityOutlets.map(o => o.url))
  
  // Also get national feeds for the country (exclude ones already in city feeds)
  const nationalOutlets = getNationalFeedsForCountry(countryCode)
    .filter(outlet => !cityOutletUrls.has(outlet.url))
  
  if (cityOutlets.length > 0 || nationalOutlets.length > 0) {
    
    // Add city-specific feeds
    cityOutlets.forEach(outlet => {
      discoveredFeeds.push({
        name: outlet.name,
        url: outlet.url,
        language: outlet.language || 'en',
        region: normalizedCityName,
        discovered: true,
        source: 'curated-database'
      })
    })
    
    // Add national feeds (with empty region)
    nationalOutlets.forEach(outlet => {
      discoveredFeeds.push({
        name: outlet.name,
        url: outlet.url,
        language: outlet.language || 'en',
        region: '', // Empty for national/international feeds
        discovered: true,
        source: 'curated-database'
      })
    })
  }
  
  // Strategy 2: Try known news domains with city-specific patterns
  if (countryCode && KNOWN_NEWS_DOMAINS[countryCode]) {
    const knownSources = KNOWN_NEWS_DOMAINS[countryCode]
    
    for (const source of knownSources) {
      // Try city-specific subdomain or path patterns
      const possibleUrls = [
        `https://${cityName}.${source.pattern}${source.rssPattern}`,
        `https://www.${cityName}.${source.pattern}${source.rssPattern}`,
        `https://${source.pattern}/${cityName}${source.rssPattern}`,
        `https://${source.pattern}/news/${cityName}${source.rssPattern}`,
        `https://${source.pattern}/local/${cityName}${source.rssPattern}`,
      ]
      
      for (const url of possibleUrls) {
        const discovered = await tryDiscoverRss(url, `${source.name} - ${normalizedCityName}`)
        if (discovered) {
          // Check if we already have this outlet
          const exists = discoveredFeeds.some(f => f.url === discovered.url)
          if (!exists) {
            discoveredFeeds.push({
              ...discovered,
              language: 'en',
              region: normalizedCityName,
              source: 'pattern-discovery'
            })
          }
          break // Found one, move to next source
        }
      }
    }
  }
  
  // Strategy 3: Try Wikipedia to find news outlets (optional, slower)
  // This can be enabled if needed but is slower
  
  // Strategy 4: NewsAPI (requires API key - optional)
  // Can be added if user provides API key
  
  return discoveredFeeds
}

// Build Google News RSS URL for a city
const buildGoogleNewsRssUrl = (cityName, countryCode) => {
  // Google News RSS format
  // https://news.google.com/rss/search?q=montreal&hl=en&gl=CA&ceid=CA:en
  if (!cityName) return null
  
  const language = 'en' // Could be made configurable
  const gl = countryCode || 'US' // Country code for Google News
  const ceid = countryCode ? `${countryCode}:${language}` : `${gl}:${language}`
  
  return `https://news.google.com/rss/search?q=${encodeURIComponent(cityName)}&hl=${language}&gl=${gl}&ceid=${ceid}`
}

// Get country code from country name
const getCountryCode = (countryName) => {
  const countryMap = {
    'canada': 'CA',
    'united states': 'US',
    'united states of america': 'US',
    'usa': 'US',
    'france': 'FR',
    'united kingdom': 'GB',
    'uk': 'GB',
    'germany': 'DE',
    'spain': 'ES',
    'italy': 'IT',
    'australia': 'AU',
  }
  
  return countryMap[countryName.toLowerCase()] || null
}

// Validate RSS feed URL (tries direct access first, then proxies)
export const validateRssFeed = async (url) => {
  try {
    let response = null
    let text = null
    
    // Use backend proxy to avoid CORS issues
    try {
      const proxyUrl = apiUrl(`/api/proxy/rss?url=${encodeURIComponent(url)}`)
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000)
      
      response = await fetch(proxyUrl, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/rss+xml, application/xml, text/xml, */*'
        }
      })
      
      clearTimeout(timeoutId)
      
      if (!response.ok) {
        return { valid: false, error: `HTTP ${response.status}` }
      }
      
      text = await response.text()
    } catch (error) {
      return { valid: false, error: error.message || 'Failed to fetch feed' }
    }
    
    if (!text) {
      return { valid: false, error: 'Failed to fetch feed' }
    }
    
    const isValid = text.includes('<rss') || text.includes('<feed') || text.includes('<?xml')
    
    return {
      valid: isValid,
      error: isValid ? null : 'Not a valid RSS/XML feed'
    }
  } catch (error) {
    return {
      valid: false,
      error: error.message || 'Failed to fetch feed'
    }
  }
}
