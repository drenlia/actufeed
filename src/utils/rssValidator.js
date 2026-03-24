// Utility to validate RSS feeds and extract channel metadata
// Uses backend proxy to avoid CORS issues

/**
 * Validates an RSS feed URL and extracts channel metadata
 * @param {string} feedUrl - The RSS feed URL to validate
 * @returns {Promise<{valid: boolean, channel?: Object, errors?: Array<string>, warnings?: Array<string>}>}
 */
export const validateRssFeed = async (feedUrl) => {
  const errors = []
  const warnings = []
  
  // Basic URL validation
  try {
    new URL(feedUrl)
  } catch (e) {
    return {
      valid: false,
      errors: ['Invalid URL format'],
      warnings: []
    }
  }
  
  let xmlText = null
  
  // Try to fetch the feed using backend proxy
  try {
    const proxyUrl = `/api/proxy/rss?url=${encodeURIComponent(feedUrl)}`
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)
    
    const response = await fetch(proxyUrl, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/rss+xml, application/xml, text/xml, */*'
      }
    })
    
    clearTimeout(timeoutId)
    
    if (!response.ok) {
      if (response.status === 404) {
        return {
          valid: false,
          errors: [`Feed not found (404). Please check the URL: ${feedUrl}`],
          warnings: []
        }
      }
      const errorText = await response.text().catch(() => 'Unknown error')
      return {
        valid: false,
        errors: [`Failed to fetch feed (${response.status}): ${errorText}`],
        warnings: []
      }
    }
    
    xmlText = await response.text()
    
    if (!xmlText || xmlText.trim().length === 0) {
      return {
        valid: false,
        errors: ['Feed returned empty content'],
        warnings: []
      }
    }
    
    // Check if response is HTML (error page) instead of XML
    // This can happen even when Content-Type header says RSS/XML (like this site does)
    const trimmedText = xmlText.trim()
    
    // Validate it's actually XML/RSS
    if (trimmedText.startsWith('<!DOCTYPE') || 
        trimmedText.startsWith('<html') || 
        (!trimmedText.includes('<rss') && !trimmedText.includes('<feed') && !trimmedText.includes('<?xml'))) {
      // Check if it's a 404 page
      const is404Page = trimmedText.includes('404') || 
                        trimmedText.toLowerCase().includes('page introuvable') ||
                        trimmedText.toLowerCase().includes('not found') ||
                        trimmedText.toLowerCase().includes('page not found') ||
                        trimmedText.toLowerCase().includes('désolé')
      
      return {
        valid: false,
        errors: [
          is404Page 
            ? `Feed not found (404). The server returned an HTML 404 error page instead of RSS feed.`
            : 'Feed returned HTML instead of RSS/XML. Please check the URL.',
          `URL: ${feedUrl}`
        ],
        warnings: []
      }
    }
    
    // Parse XML
    const parser = new DOMParser()
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml')
    
    // Check for parse errors
    const parseError = xmlDoc.querySelector('parsererror')
    if (parseError) {
      const errorText = parseError.textContent || 'Unknown XML parsing error'
      return {
        valid: false,
        errors: [`XML parsing error: ${errorText.substring(0, 100)}`],
        warnings: []
      }
    }
    
    // Check if it's RSS or Atom feed
    const rss = xmlDoc.querySelector('rss')
    const feed = xmlDoc.querySelector('feed') // Atom feed
    const rdf = xmlDoc.querySelector('RDF') // RDF feed
    
    if (!rss && !feed && !rdf) {
      return {
        valid: false,
        errors: ['Not a valid RSS, Atom, or RDF feed'],
        warnings: []
      }
    }
    
    // Extract channel/item information
    let channel = null
    let items = []
    
    if (rss) {
      // RSS 2.0 format
      channel = rss.querySelector('channel')
      items = channel ? channel.querySelectorAll('item') : []
    } else if (feed) {
      // Atom (including Atom 1.0: xmlns http://www.w3.org/2005/Atom) — not supported for manual sources;
      // the app reader only ingests RSS 2.0-style <item> elements.
      const channelTitle = feed.querySelector('title')?.textContent?.trim() || ''
      const entryCount = feed.querySelectorAll('entry').length
      const selfLinkEl = Array.from(feed.querySelectorAll('link')).find(
        (l) => (l.getAttribute('rel') || 'alternate') === 'self'
      )
      return {
        valid: false,
        incompatibleFeedFormat: 'atom10',
        errors: [],
        warnings: [],
        channel: {
          title: channelTitle || 'Atom feed',
          description: feed.querySelector('subtitle')?.textContent?.trim() || '',
          link:
            selfLinkEl?.getAttribute('href') ||
            feed.querySelector('link[href]')?.getAttribute('href') ||
            feedUrl,
          language: feed.getAttribute('xml:lang') || '',
          itemCount: entryCount,
        },
      }
    } else if (rdf) {
      // RDF format
      channel = rdf.querySelector('channel')
      items = rdf.querySelectorAll('item')
    }
    
    if (!channel) {
      return {
        valid: false,
        errors: ['Feed does not contain a channel element'],
        warnings: []
      }
    }
    
    // Validate required fields in channel
    const channelTitle = channel.querySelector('title')?.textContent || ''
    const channelDescription = channel.querySelector('description')?.textContent || 
                              channel.querySelector('subtitle')?.textContent || '' // Atom uses subtitle
    
    // Check for items
    if (items.length === 0) {
      warnings.push('Feed contains no items/articles')
    }
    
    // Validate required fields in items
    // Note: category is optional in RSS 2.0 spec, so we don't require it
    const requiredFields = {
      title: false,
      description: false,
      pubDate: false
    }
    
    const sampleItems = Array.from(items).slice(0, 5) // Check first 5 items
    
    if (sampleItems.length > 0) {
      sampleItems.forEach(item => {
        if (item.querySelector('title')?.textContent) requiredFields.title = true
        if (item.querySelector('description')?.textContent || 
            item.querySelector('summary')?.textContent || 
            item.querySelector('content')?.textContent) requiredFields.description = true
        if (item.querySelector('pubDate')?.textContent || 
            item.querySelector('published')?.textContent ||
            item.querySelector('dc\\:date')?.textContent) requiredFields.pubDate = true
        // Categories are optional in RSS 2.0, so we don't check for them
      })
    } else {
      // No items to validate, but feed structure is valid
      warnings.push('Feed structure is valid but contains no items to validate')
    }
    
    // Build error list for missing required fields
    // Note: category is optional in RSS 2.0, so we don't require it
    const missingFields = []
    if (!requiredFields.title) missingFields.push('title')
    if (!requiredFields.description) missingFields.push('description')
    if (!requiredFields.pubDate) missingFields.push('pubDate')
    
    // Check if categories exist (optional, but warn if missing)
    let hasCategories = false
    if (sampleItems.length > 0) {
      hasCategories = sampleItems.some(item => 
        item.querySelector('category') || 
        item.querySelector('dc\\:subject') ||
        item.querySelector('media\\:category')
      )
    }
    if (!hasCategories && items.length > 0) {
      warnings.push('Feed items do not contain category information (optional in RSS 2.0)')
    }
    
    if (missingFields.length > 0) {
      return {
        valid: false,
        errors: [`Feed items are missing required fields: ${missingFields.join(', ')}`],
        warnings: warnings,
        channel: {
          title: channelTitle,
          description: channelDescription,
          link: channel.querySelector('link')?.textContent || feedUrl,
          language: channel.querySelector('language')?.textContent || '',
          itemCount: items.length
        }
      }
    }
    
    // Extract channel metadata
    const channelData = {
      title: channelTitle || 'Untitled Feed',
      description: channelDescription || '',
      link: channel.querySelector('link')?.textContent || 
            channel.querySelector('link')?.getAttribute('href') || 
            feedUrl,
      language: channel.querySelector('language')?.textContent || 
                channel.getAttribute('xml:lang') || 
                'en',
      itemCount: items.length,
      lastBuildDate: channel.querySelector('lastBuildDate')?.textContent || 
                     channel.querySelector('updated')?.textContent || 
                     null
    }
    
    return {
      valid: true,
      channel: channelData,
      errors: [],
      warnings: warnings
    }
    
  } catch (error) {
    if (error.name === 'AbortError') {
      return {
        valid: false,
        errors: ['Request timed out. Please check the URL and try again.'],
        warnings: []
      }
    }
    
    return {
      valid: false,
      errors: [`Error validating feed: ${error.message || 'Unknown error'}`],
      warnings: []
    }
  }
}
