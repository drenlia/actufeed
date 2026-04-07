// Utility to parse OPML files and extract RSS feeds
// OPML files can be downloaded from:
// - https://github.com/plenaryapp/awesome-rss-feeds (country-organized)
// - https://morerss.com/opml_en.html (extensive English feeds)
// - Various community-shared OPML files

import { apiUrl } from './apiBase'

/**
 * Parse an OPML file (XML format) and extract RSS feeds
 * @param {string} opmlText - The OPML file content as text
 * @returns {Array} Array of feed objects with {title, xmlUrl, htmlUrl, category}
 */
export const parseOPML = (opmlText) => {
  const feeds = []
  
  try {
    const parser = new DOMParser()
    const xmlDoc = parser.parseFromString(opmlText, 'text/xml')
    
    // Check for parsing errors
    const parseError = xmlDoc.querySelector('parsererror')
    if (parseError) {
      throw new Error('Invalid OPML file format')
    }
    
    // OPML structure: <opml><body><outline>...</outline></body></opml>
    // Each outline can have xmlUrl (RSS feed) or contain nested outlines
    const outlines = xmlDoc.querySelectorAll('outline')
    
    outlines.forEach(outline => {
      const xmlUrl = outline.getAttribute('xmlUrl')
      const title = outline.getAttribute('title') || outline.getAttribute('text') || ''
      const htmlUrl = outline.getAttribute('htmlUrl') || ''
      const category = outline.getAttribute('category') || ''
      const type = outline.getAttribute('type') || 'rss'
      
      // If this outline has an xmlUrl, it's a feed
      if (xmlUrl && type === 'rss') {
        feeds.push({
          title: title.trim(),
          xmlUrl: xmlUrl.trim(),
          htmlUrl: htmlUrl.trim(),
          category: category.trim(),
          type: type
        })
      }
      
      // Also check nested outlines (categories/folders)
      const nestedOutlines = outline.querySelectorAll('outline')
      nestedOutlines.forEach(nested => {
        const nestedXmlUrl = nested.getAttribute('xmlUrl')
        const nestedTitle = nested.getAttribute('title') || nested.getAttribute('text') || ''
        const nestedHtmlUrl = nested.getAttribute('htmlUrl') || ''
        const nestedCategory = category || nested.getAttribute('category') || ''
        const nestedType = nested.getAttribute('type') || 'rss'
        
        if (nestedXmlUrl && nestedType === 'rss') {
          feeds.push({
            title: nestedTitle.trim(),
            xmlUrl: nestedXmlUrl.trim(),
            htmlUrl: nestedHtmlUrl.trim(),
            category: nestedCategory.trim() || category.trim(),
            type: nestedType
          })
        }
      })
    })
    
    return feeds
  } catch (error) {
    console.error('Error parsing OPML:', error)
    return []
  }
}

/**
 * Convert OPML feeds to our cityNewsOutlets.json format
 * This is a helper to manually review and organize feeds by city
 * @param {Array} feeds - Array of feed objects from parseOPML
 * @param {string} cityName - City name
 * @param {string} countryCode - Country code (CA, US, etc.)
 * @returns {Array} Formatted outlets array
 */
export const convertOPMLFeedsToOutlets = (feeds, cityName, countryCode) => {
  return feeds
    .filter(feed => {
      // Filter feeds that might be relevant to the city
      // This is a basic filter - you'll need to review manually
      const titleLower = feed.title.toLowerCase()
      const urlLower = feed.xmlUrl.toLowerCase()
      const cityLower = cityName.toLowerCase()
      
      return titleLower.includes(cityLower) || 
             urlLower.includes(cityLower) ||
             feed.category.toLowerCase().includes(cityLower)
    })
    .map(feed => ({
      name: feed.title,
      url: feed.xmlUrl,
      language: detectLanguage(feed.title, feed.xmlUrl),
      type: detectType(feed.title, feed.category)
    }))
}

/**
 * Detect language from feed title/URL
 */
const detectLanguage = (title, url) => {
  const text = `${title} ${url}`.toLowerCase()
  if (text.includes('français') || text.includes('french') || text.includes('.fr/')) {
    return 'fr'
  }
  return 'en' // Default
}

/**
 * Detect outlet type from title/category
 */
const detectType = (title, category) => {
  const text = `${title} ${category}`.toLowerCase()
  if (text.includes('tv') || text.includes('television') || text.includes('broadcast')) {
    return 'broadcast'
  }
  if (text.includes('radio')) {
    return 'radio'
  }
  if (text.includes('newspaper') || text.includes('times') || text.includes('herald') || 
      text.includes('gazette') || text.includes('journal') || text.includes('post') ||
      text.includes('star') || text.includes('sun') || text.includes('tribune')) {
    return 'newspaper'
  }
  return 'online'
}

/**
 * Fetch and parse an OPML file from a URL
 * @param {string} url - URL to the OPML file
 * @returns {Promise<Array>} Array of feed objects
 */
export const fetchAndParseOPML = async (url) => {
  try {
    // Use backend proxy to avoid CORS issues
    const proxyUrl = apiUrl(`/api/proxy/rss?url=${encodeURIComponent(url)}`)
    const response = await fetch(proxyUrl, {
      headers: {
        'Accept': 'application/xml, text/xml, */*'
      }
    })
    
    if (!response || !response.ok) {
      throw new Error(`Failed to fetch OPML: ${response?.status || 'Unknown error'}`)
    }
    
    const opmlText = await response.text()
    return parseOPML(opmlText)
  } catch (error) {
    console.error('Error fetching OPML:', error)
    return []
  }
}
