// Utility to validate RSS feeds and extract channel metadata
// Uses backend proxy to avoid CORS issues

import { rssItemEntryHasArticleThumbnail } from '../services/rssService'

const MRSS_NS = 'http://search.yahoo.com/mrss/'
const ATOM_NS = 'http://www.w3.org/2005/Atom'

function isYoutubeManualChannelUrl(url) {
  try {
    const u = new URL(String(url).trim())
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
    const h = u.hostname.replace(/^www\./i, '').toLowerCase()
    return h === 'youtube.com' || h === 'm.youtube.com'
  } catch {
    return false
  }
}

/** Normalize http YouTube URLs to https so they use /api/youtube/resolve like the app. */
function normalizeYoutubeManualUrl(input) {
  try {
    const u = new URL(String(input).trim())
    const h = u.hostname.replace(/^www\./i, '').toLowerCase()
    if ((h === 'youtube.com' || h === 'm.youtube.com') && u.protocol === 'http:') {
      u.protocol = 'https:'
      return u.toString()
    }
  } catch {
    /* ignore */
  }
  return String(input).trim()
}

/**
 * Validates an RSS feed URL and extracts channel metadata
 * @param {string} feedUrl - The RSS feed URL to validate
 * @returns {Promise<{valid: boolean, channel?: Object, errors?: Array<string>, warnings?: Array<string>, resolvedFeedUrl?: string, feedFormat?: string}>}
 */
export const validateRssFeed = async (feedUrl) => {
  const warnings = []
  const normalizedInput = normalizeYoutubeManualUrl(feedUrl)

  // Basic URL validation
  try {
    new URL(normalizedInput)
  } catch {
    return {
      valid: false,
      errors: ['Invalid URL format'],
      warnings: []
    }
  }

  if (isYoutubeManualChannelUrl(normalizedInput)) {
    try {
      const resolveUrl = `/api/youtube/resolve?url=${encodeURIComponent(normalizedInput)}`
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 25000)
      const response = await fetch(resolveUrl, { signal: controller.signal })
      clearTimeout(timeoutId)
      let data = {}
      try {
        data = await response.json()
      } catch {
        data = {}
      }
      if (!response.ok || !data.valid) {
        const errs = data.errors || [data.error || `YouTube check failed (${response.status})`]
        return {
          valid: false,
          errors: Array.isArray(errs) ? errs : [String(errs)],
          warnings: [],
        }
      }
      const w = data.warnings || []
      if (Array.isArray(w) && w.length) warnings.push(...w)
      return {
        valid: true,
        feedFormat: data.feedFormat || 'atom',
        resolvedFeedUrl: data.resolvedFeedUrl,
        channel: data.channel,
        errors: [],
        warnings,
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        return {
          valid: false,
          errors: ['YouTube validation timed out. Try again.'],
          warnings: [],
        }
      }
      return {
        valid: false,
        errors: [`YouTube validation error: ${error.message || 'Unknown error'}`],
        warnings: [],
      }
    }
  }
  
  let xmlText = null
  
  // Try to fetch the feed using backend proxy
  try {
    const proxyUrl = `/api/proxy/rss?url=${encodeURIComponent(normalizedInput)}`
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)
    
    const response = await fetch(proxyUrl, {
      signal: controller.signal,
      headers: {
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
      }
    })
    
    clearTimeout(timeoutId)
    
    if (!response.ok) {
      if (response.status === 404) {
        return {
          valid: false,
          errors: [`Feed not found (404). Please check the URL: ${normalizedInput}`],
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
          `URL: ${normalizedInput}`
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
    
    const rss = xmlDoc.querySelector('rss')
    const atomFeed =
      xmlDoc.querySelector('feed') || xmlDoc.getElementsByTagNameNS(ATOM_NS, 'feed')[0] || null
    const rdf = xmlDoc.querySelector('RDF')

    if (!rss && !atomFeed && !rdf) {
      return {
        valid: false,
        errors: ['Not a valid RSS, Atom, or RDF feed'],
        warnings: [],
      }
    }

    const getAtomEntryLink = (entry) => {
      const links = [...entry.getElementsByTagNameNS(ATOM_NS, 'link')]
      const href =
        links.find((l) => (l.getAttribute('rel') || 'alternate') === 'alternate')?.getAttribute('href') ||
        links.find((l) => !l.getAttribute('rel'))?.getAttribute('href') ||
        links[0]?.getAttribute('href') ||
        ''
      return (href || '').trim()
    }

    const nodeHasBodyText = (node, isAtom) => {
      if (isAtom) {
        const summary = node.getElementsByTagNameNS(ATOM_NS, 'summary')[0]
        const content = node.getElementsByTagNameNS(ATOM_NS, 'content')[0]
        if (summary?.textContent?.trim() || content?.textContent?.trim()) {
          return true
        }
        const mediaDesc = node.getElementsByTagNameNS(MRSS_NS, 'description')[0]
        return !!mediaDesc?.textContent?.trim()
      }
      return !!(
        node.querySelector('description')?.textContent ||
        node.querySelector('summary')?.textContent ||
        node.querySelector('content')?.textContent
      )
    }

    const nodeHasDate = (node, isAtom) => {
      if (isAtom) {
        const pub = node.getElementsByTagNameNS(ATOM_NS, 'published')[0]
        const upd = node.getElementsByTagNameNS(ATOM_NS, 'updated')[0]
        return !!(pub?.textContent?.trim() || upd?.textContent?.trim())
      }
      return !!(
        node.querySelector('pubDate')?.textContent ||
        node.querySelector('published')?.textContent ||
        node.querySelector('dc\\:date')?.textContent
      )
    }

    let channel = null
    let itemNodes = []
    let feedFormat = 'rss2'
    let isAtom = false

    if (rss) {
      channel = rss.querySelector('channel')
      itemNodes = channel ? Array.from(channel.querySelectorAll('item')) : []
    } else if (atomFeed) {
      channel = atomFeed
      itemNodes = Array.from(atomFeed.getElementsByTagNameNS(ATOM_NS, 'entry'))
      feedFormat = 'atom'
      isAtom = true
    } else if (rdf) {
      channel = rdf.querySelector('channel')
      itemNodes = channel ? Array.from(channel.querySelectorAll('item')) : []
    }

    if (!channel) {
      return {
        valid: false,
        errors: ['Feed does not contain a channel (RSS/RDF) or feed root (Atom)'],
        warnings: [],
      }
    }

    const channelTitle = isAtom
      ? channel.getElementsByTagNameNS(ATOM_NS, 'title')[0]?.textContent?.trim() || ''
      : channel.querySelector('title')?.textContent?.trim() || ''
    const channelDescription = isAtom
      ? channel.getElementsByTagNameNS(ATOM_NS, 'subtitle')[0]?.textContent?.trim() || ''
      : channel.querySelector('description')?.textContent?.trim() ||
        channel.querySelector('subtitle')?.textContent?.trim() ||
        ''

    if (itemNodes.length === 0) {
      warnings.push('Feed contains no items or entries')
    }

    const requiredFields = { title: false, description: false, pubDate: false }
    let atomHasEntryLink = !isAtom
    const sampleItems = itemNodes.slice(0, 5)

    if (sampleItems.length > 0) {
      sampleItems.forEach((node) => {
        const entryTitle = isAtom
          ? node.getElementsByTagNameNS(ATOM_NS, 'title')[0]?.textContent?.trim()
          : node.querySelector('title')?.textContent?.trim()
        if (entryTitle) requiredFields.title = true
        if (nodeHasBodyText(node, isAtom)) requiredFields.description = true
        if (nodeHasDate(node, isAtom)) requiredFields.pubDate = true
        if (isAtom && getAtomEntryLink(node)) atomHasEntryLink = true
      })
    } else {
      warnings.push('Feed structure is valid but contains no entries to validate')
    }

    const missingFields = []
    if (!requiredFields.title) missingFields.push('title')
    // Description/summary is optional: Yahoo and others often omit item body text (title + link + date only).
    if (!requiredFields.description && itemNodes.length > 0 && sampleItems.length > 0) {
      warnings.push(
        'Sample entries have no article description or summary; cards may show the headline only (optional)'
      )
    }
    if (!requiredFields.pubDate) missingFields.push(isAtom ? 'published or updated' : 'pubDate')
    if (isAtom && !atomHasEntryLink) missingFields.push('entry link (href)')

    let hasCategories = false
    if (sampleItems.length > 0) {
      hasCategories = sampleItems.some(
        (item) =>
          item.querySelector('category') ||
          item.querySelector('dc\\:subject') ||
          item.querySelector('media\\:category')
      )
    }
    if (!hasCategories && itemNodes.length > 0) {
      warnings.push('Feed entries do not contain category information (optional)')
    }

    let itemLevelImagesMissing = false
    if (sampleItems.length > 0) {
      const anyItemThumb = sampleItems.some((node) => rssItemEntryHasArticleThumbnail(node, isAtom))
      itemLevelImagesMissing = !anyItemThumb
      if (itemLevelImagesMissing) {
        warnings.push(
          'Sample entries have no per-article images; cards may show only the feed logo (optional)'
        )
      }
    }

    let channelWebLink = normalizedInput
    if (isAtom) {
      const links = [...channel.getElementsByTagNameNS(ATOM_NS, 'link')]
      const alt = links.find((l) => (l.getAttribute('rel') || '') === 'alternate')
      channelWebLink =
        alt?.getAttribute('href')?.trim() ||
        links[0]?.getAttribute('href')?.trim() ||
        normalizedInput
    } else {
      channelWebLink =
        channel.querySelector('link')?.textContent?.trim() ||
        channel.querySelector('link')?.getAttribute?.('href')?.trim() ||
        normalizedInput
    }

    const channelLanguage =
      channel.querySelector('language')?.textContent?.trim() ||
      channel.getAttribute('xml:lang') ||
      'en'

    if (missingFields.length > 0) {
      return {
        valid: false,
        errors: [`Feed items are missing required fields: ${missingFields.join(', ')}`],
        missingRequiredItemFields: [...missingFields],
        warnings,
        itemLevelImagesMissing,
        previewEligible: true,
        xmlText,
        channel: {
          title: channelTitle,
          description: channelDescription,
          link: channelWebLink,
          language: channelLanguage,
          itemCount: itemNodes.length,
        },
      }
    }

    const channelData = {
      title: channelTitle || 'Untitled Feed',
      description: channelDescription || '',
      link: channelWebLink,
      language: channelLanguage,
      itemCount: itemNodes.length,
      lastBuildDate:
        channel.querySelector('lastBuildDate')?.textContent?.trim() ||
        (isAtom
          ? channel.getElementsByTagNameNS(ATOM_NS, 'updated')[0]?.textContent?.trim()
          : channel.querySelector('updated')?.textContent?.trim()) ||
        null,
    }

    return {
      valid: true,
      feedFormat,
      channel: channelData,
      errors: [],
      warnings,
      itemLevelImagesMissing,
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
