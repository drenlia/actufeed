import { extractChannelSiteUrlFromXmlDoc, resolveSiteLogoFromMarketingPages } from '../utils/siteLogoResolver'
import { resolveLogoViaWikimediaCommons } from '../utils/wikimediaLogoResolver'
import {
  loadFeedLogoEntry,
  saveFeedLogoEntry,
  shouldRunFeedLogoNetworkProbe,
  buildFaviconUrlCandidates,
} from '../utils/feedLogoCache'
import { verifyRemoteImageUrl } from '../utils/assetUrlCheck'
import { getPermanentFeedLogoUrl } from '../utils/feedLogoPermanent'

// Backend proxy is used instead of CORS proxies

// Decode HTML entities in text
const decodeHtmlEntities = (text) => {
  if (!text) return ''
  
  // Use a textarea with innerHTML (safe for textarea - doesn't trigger resource loading)
  // Textarea elements don't parse HTML, they just decode entities
  const textarea = document.createElement('textarea')
  textarea.innerHTML = text
  return textarea.value
}

// Strip HTML tags from text and decode entities (keep paragraph breaks from </p>, <br>, block ends)
const stripHtmlTags = (html) => {
  if (!html) return ''

  let text = decodeHtmlEntities(html)

  text = text
    .replace(/<style[^>]*>.*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/\s+style\s*=\s*["'][^"']*["']/gi, '')
    .replace(/\s+style\s*=\s*[^>\s]+/gi, '')
    .replace(/<link[^>]*rel\s*=\s*["']stylesheet["'][^>]*>/gi, '')
    .replace(/<link[^>]*type\s*=\s*["']text\/css["'][^>]*>/gi, '')
    .replace(/\s+class\s*=\s*["'][^"']*["']/gi, '')
    .replace(/<\/p\s*>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:div|h[1-6]|li|tr|blockquote|article|section|header|footer)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t\f\v\u00a0]+/g, ' ')
    .replace(/ *\n+ */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return text
}

// Extract categories from RSS item
const extractCategories = (item, source) => {
  const categories = []
  
  // Helper function to normalize category paths (extract last segment from hierarchical paths)
  // Example: "fox-news/us/congress" -> "congress", "fox-news/politics" -> "politics"
  const normalizeCategory = (text) => {
    const trimmed = text.trim()
    if (!trimmed) return trimmed
    
    // If category contains "/", extract the last segment
    if (trimmed.includes('/')) {
      const segments = trimmed.split('/').filter(s => s.trim())
      if (segments.length > 0) {
        return segments[segments.length - 1].trim()
      }
    }
    
    return trimmed
  }
  
  // Helper function to check if a category is a valid category (not metadata/technical)
  // Filters out UUIDs, GUIDs, metadata fields, and other non-category identifiers
  const isValidCategory = (text) => {
    // First normalize the category (extract last segment from paths)
    const normalized = normalizeCategory(text)
    const trimmed = normalized.trim()
    if (!trimmed) return false
    
    // Exclude UUID/GUID patterns (8-4-4-4-12 hex digits with hyphens)
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (uuidPattern.test(trimmed)) {
      return false
    }
    
    // Exclude if it's all hex digits and hyphens (no actual words)
    if (/^[0-9a-f\-]+$/i.test(trimmed) && trimmed.length > 10) {
      return false
    }
    
    // Exclude pipe-separated key-value pairs (metadata fields like "site|engadget", "provider_name|Engadget")
    if (/\|/.test(trimmed)) {
      return false
    }
    
    // Exclude metadata field names (contains "metadata", "taxonomy", "section-path", "content-type")
    const metadataPatterns = [
      /metadata/i,
      /taxonomy/i,
      /section-path/i,
      /content-type/i,
      /dc\.(identifier|source|subject)/i,
      /prism\./i,
      /^[a-z0-9-]+\.com\//i, // URLs like "foxnews.com/metadata/..."
    ]
    if (metadataPatterns.some(pattern => pattern.test(trimmed))) {
      return false
    }
    
    // Exclude metadata field names (underscore-separated fields like "provider_name", "author_name", "region", "language")
    const metadataFieldPatterns = [
      /^(site|provider|author|region|language|country|publisher|rights|creator|source|identifier|subject|coverage|date|format|type|relation|contributor|title|description|link|category|generator|managingeditor|webmaster|copyright|lastbuilddate|pubdate|ttl|rating|image|textinput|skiphours|skipdays|enclosure|guid|comments|source)_?(name|id|code|value|type|path|url|link)?$/i,
      /^headline$/i, // "headline" is typically metadata, not a category
      /^media$/i, // "media" is too generic and often metadata
    ]
    if (metadataFieldPatterns.some(pattern => pattern.test(trimmed))) {
      return false
    }
    
    // Exclude if it looks like a metadata field (ends with common metadata suffixes)
    const metadataSuffixes = ['_name', '_id', '_code', '_type', '_path', '_url', '_link', '_value']
    if (metadataSuffixes.some(suffix => trimmed.toLowerCase().endsWith(suffix))) {
      return false
    }
    
    // Exclude very short categories (less than 3 characters) unless they're common category words
    const commonShortCategories = ['us', 'uk', 'ca', 'fr', 'en', 'de', 'it', 'es', 'pt', 'ru', 'cn', 'jp']
    if (trimmed.length < 3 && !commonShortCategories.includes(trimmed.toLowerCase())) {
      return false
    }
    
    // Exclude common non-category words
    const nonCategoryWords = [
      'article', 'fnc', 'rss', 'xml', 'feed', 'item', 'post', 'entry',
      'page', 'url', 'link', 'id', 'guid', 'pubdate', 'date',
      'headline', 'media' // Too generic, often metadata
    ]
    if (nonCategoryWords.includes(trimmed.toLowerCase())) {
      return false
    }
    
    // Exclude if it's just a domain or looks like a technical path
    // Patterns like "foxnews.com/something" or just domain names
    if (/^[a-z0-9-]+\.(com|org|net|edu|gov|io|co)\/?/i.test(trimmed) && !trimmed.includes('/')) {
      return false
    }
    
    // Exclude single words that are too generic (likely metadata labels)
    const genericMetadataWords = ['media', 'headline', 'content', 'text', 'data', 'info', 'meta']
    if (genericMetadataWords.includes(trimmed.toLowerCase()) && trimmed.split(/\s+/).length === 1) {
      return false
    }
    
    // Exclude person names (patterns like "kristi-noem", "donald-trump", etc.)
    // Person names typically have capitalized words or are in kebab-case with proper names
    // Check if it looks like a person name (contains common name patterns)
    const personNamePatterns = [
      /^[A-Z][a-z]+-[A-Z][a-z]+/, // "Kristi-Noem", "Donald-Trump"
      /^[a-z]+-[a-z]+-[a-z]+$/, // Multiple kebab-case segments (likely a name)
    ]
    // Also check if it's in a "person/" path (already normalized, but check original if available)
    if (text.includes('/person/') || personNamePatterns.some(pattern => pattern.test(trimmed))) {
      return false
    }
    
    // Exclude overly generic single-segment categories from paths
    // If the original had a path and the last segment is too generic, exclude it
    if (text.includes('/')) {
      const genericPathSegments = ['us', 'world', 'person', 'topic', 'source', 'site']
      if (genericPathSegments.includes(trimmed.toLowerCase())) {
        return false
      }
    }
    
    // Must contain at least one letter (a-z, A-Z)
    if (!/[a-zA-Z]/.test(trimmed)) {
      return false
    }
    
    return true
  }
  
  // RSS <category> text and Atom <category term="…"/>
  item.querySelectorAll('category').forEach((cat) => {
    const term = cat.getAttribute?.('term')?.trim()
    const catText = decodeHtmlEntities(term || cat.textContent?.trim() || '')
    if (catText && isValidCategory(catText)) {
      const normalized = normalizeCategory(catText)
      if (normalized && !categories.includes(normalized)) {
        categories.push(normalized)
      }
    }
    // Also check domain attribute (some feeds use category domain="...")
    const domain = cat.getAttribute('domain')
    if (domain && isValidCategory(domain)) {
      const normalized = normalizeCategory(domain)
      if (normalized && !categories.includes(normalized)) {
        categories.push(normalized)
      }
    }
  })
  
  // Dublin Core subject
  item.querySelectorAll('dc\\:subject').forEach(cat => {
    const catText = decodeHtmlEntities(cat.textContent?.trim() || '')
    if (catText && isValidCategory(catText)) {
      const normalized = normalizeCategory(catText)
      if (normalized && !categories.includes(normalized)) {
        categories.push(normalized)
      }
    }
  })
  
  // Media RSS category
  item.querySelectorAll('media\\:category').forEach(cat => {
    const catText = decodeHtmlEntities(cat.textContent?.trim() || '')
    if (catText && isValidCategory(catText)) {
      const normalized = normalizeCategory(catText)
      if (normalized && !categories.includes(normalized)) {
        categories.push(normalized)
      }
    }
  })
  
  // Check for categories in other namespaces
  Array.from(item.children).forEach(child => {
    if (child.localName === 'category') {
      const catText = decodeHtmlEntities(child.textContent?.trim() || '')
      if (catText && isValidCategory(catText)) {
        const normalized = normalizeCategory(catText)
        if (normalized && !categories.includes(normalized)) {
          categories.push(normalized)
        }
      }
    }
  })
  
  // Some feeds put categories in tags or keywords
  const tags = item.querySelector('tags')?.textContent || 
              item.querySelector('keywords')?.textContent || ''
  if (tags) {
    tags.split(',').forEach(tag => {
      const tagText = decodeHtmlEntities(tag.trim())
      if (tagText && isValidCategory(tagText)) {
        const normalized = normalizeCategory(tagText)
        if (normalized && !categories.includes(normalized)) {
          categories.push(normalized)
        }
      }
    })
  }
  
  return categories
}

/** PR wires embed tracking / “tiny” images first; skip so we prefer real article art (e.g. wp-content/uploads). */
function isSkippableWireServiceThumbUrl(url) {
  if (!url || url.length < 16) return false
  const u = url.toLowerCase()
  if (u.includes('globenewswire.com/newsroom/ti')) return true
  if (u.includes('globenewswire.com') && u.includes('/tiny/')) return true
  if (u.includes('ml.globenewswire.com')) return true
  if (u.includes('ml-eu.globenewswire.com')) return true
  if (u.includes('cts.businesswire.com/ct/')) return true
  return false
}

/**
 * Postmedia full-content RSS embeds “Editor’s Picks” with theme placeholder PNGs (grey mesh).
 * Same-host scoring was beating real /wp-content/uploads/ art. Author blocks use Gravatar — not hero art.
 */
function isSkippablePlaceholderOrAvatarThumbUrl(url) {
  if (!url || url.length < 12) return false
  const u = url.toLowerCase()
  if (u.includes('placeholder-img')) return true
  if (u.includes('placeholder-image')) return true
  if (u.includes('placeholder.svg')) return true
  if (u.includes('/wp-content/themes/') && u.includes('placeholder')) return true
  if (u.includes('gravatar.com/avatar')) return true
  return false
}

/**
 * Prefer real hero art (Postmedia / WordPress) over first non-wire image.
 * Same-host + /wp-content/uploads/ + larger srcset / w= query wins.
 */
function scoreRssThumbnailCandidate(url, itemLink) {
  if (!url || isSkippableWireServiceThumbUrl(url) || isSkippablePlaceholderOrAvatarThumbUrl(url)) return -1
  let score = 0
  const u = url.toLowerCase()
  try {
    const linkHost = new URL(itemLink).hostname.replace(/^www\./, '')
    const imgHost = new URL(url).hostname.replace(/^www\./, '')
    if (imgHost === linkHost || imgHost.endsWith(`.${linkHost}`)) score += 100
  } catch {
    /* ignore */
  }
  if (u.includes('/wp-content/uploads/')) score += 90
  if (u.includes('wp.com') && u.includes('uploads')) score += 70
  if (u.includes('postmedia') && (u.includes('upload') || u.includes('wp-content'))) score += 35
  if (/\.(jpe?g|png|webp|gif|avif)(\?|$|#)/i.test(url)) score += 12
  const wMatch = u.match(/[?&]w=(\d+)/)
  if (wMatch) {
    const w = parseInt(wMatch[1], 10)
    if (w >= 900) score += 30
    else if (w >= 560) score += 22
    else if (w >= 400) score += 14
    else if (w >= 200) score += 6
  }
  score += Math.min(url.length / 30, 10)
  return score
}

function bestUrlFromSrcsetString(srcset) {
  if (!srcset || !String(srcset).trim()) return ''
  let best = ''
  let bestW = 0
  for (const part of String(srcset).split(',')) {
    const trimmed = part.trim()
    const m = trimmed.match(/^(\S+)(?:\s+(\d+)w)?/i)
    if (!m) continue
    const candidate = m[1]
    const w = m[2] ? parseInt(m[2], 10) : 0
    if (w > bestW || (w === bestW && candidate.length > best.length)) {
      bestW = w
      best = candidate
    }
  }
  return best
}

function bestNormalizedSrcFromImgElement(descImg, item) {
  const itemLink = item.querySelector('link')?.textContent || ''
  const candidates = []
  const src = descImg.getAttribute('src')
  const dataSrc =
    descImg.getAttribute('data-src') ||
    descImg.getAttribute('data-lazy-src') ||
    descImg.getAttribute('data-original')
  const srcset = descImg.getAttribute('srcset')
  if (src) candidates.push(src)
  if (dataSrc) candidates.push(dataSrc)
  const fromSet = bestUrlFromSrcsetString(srcset || '')
  if (fromSet) candidates.push(fromSet)
  const alt = (descImg.getAttribute('alt') || '').trim().toLowerCase()
  if (alt === 'placeholder-img' || /^placeholder\b/i.test(alt)) {
    return { url: '', score: -1 }
  }
  let bestUrl = ''
  let bestScore = -1
  for (const raw of candidates) {
    const n = normalizeRssImgSrcFromHtml(raw, item)
    const s = scoreRssThumbnailCandidate(n, itemLink)
    if (s > bestScore) {
      bestScore = s
      bestUrl = n
    }
  }
  return { url: bestUrl, score: bestScore }
}

function normalizeRssImgSrcFromHtml(raw, item) {
  let thumbnail = decodeHtmlEntities(String(raw || '').trim())
  if (!thumbnail || thumbnail.startsWith('data:')) return ''
  if (thumbnail.startsWith('//')) thumbnail = `https:${thumbnail}`
  else if (thumbnail.startsWith('/')) {
    const link = item.querySelector('link')?.textContent || ''
    if (link) {
      try {
        thumbnail = new URL(thumbnail, link).href
      } catch {
        /* keep relative */
      }
    }
  }
  if (!/^https?:\/\//i.test(thumbnail)) return ''
  return thumbnail
}

// Extract image/thumbnail from RSS item
const extractThumbnail = (item, description) => {
  // Try multiple selectors for different RSS formats
  let thumbnail = ''
  
  // Media RSS (YouTube, etc.)
  thumbnail = item.querySelector('media\\:thumbnail')?.getAttribute('url') || ''
  if (thumbnail) return thumbnail
  
  // Standard thumbnail element
  thumbnail = item.querySelector('thumbnail')?.getAttribute('url') || ''
  if (thumbnail) return thumbnail
  
  // Enclosure with image type
  const enclosure = item.querySelector('enclosure[type^="image"]')
  if (enclosure) {
    thumbnail = enclosure.getAttribute('url') || ''
    if (thumbnail) return thumbnail
  }
  
  // Media content
  const mediaContent = item.querySelector('media\\:content[type^="image"]')
  if (mediaContent) {
    thumbnail = mediaContent.getAttribute('url') || ''
    if (thumbnail) return thumbnail
  }
  
  // Try to extract from description HTML (most common source)
  if (description) {
    try {
      const descParser = new DOMParser()
      const descDoc = descParser.parseFromString(description, 'text/html')
      
      let bestPick = ''
      let bestPickScore = -1
      const itemLink = item.querySelector('link')?.textContent || ''
      for (const descImg of descDoc.querySelectorAll('img')) {
        const { url, score } = bestNormalizedSrcFromImgElement(descImg, item)
        if (score > bestPickScore) {
          bestPickScore = score
          bestPick = url
        }
      }
      if (bestPickScore >= 0) thumbnail = bestPick

      const ogImage = descDoc.querySelector('meta[property="og:image"]')
      if (ogImage) {
        const ogRaw = ogImage.getAttribute('content') || ''
        const ogNorm = normalizeRssImgSrcFromHtml(ogRaw, item)
        const ogScore = scoreRssThumbnailCandidate(ogNorm, itemLink)
        if (ogScore > bestPickScore) {
          thumbnail = ogNorm
          bestPickScore = ogScore
        }
      }
      if (thumbnail) return thumbnail
    } catch {
      const itemLink = item.querySelector('link')?.textContent || ''
      let bestPick = ''
      let bestPickScore = -1
      const tagRe = /<img\b[^>]*>/gi
      let tm
      while ((tm = tagRe.exec(description)) !== null) {
        const tag = tm[0]
        const altM = tag.match(/\balt=["']([^"']*)["']/i)
        const altRaw = (altM?.[1] || '').trim().toLowerCase()
        if (altRaw === 'placeholder-img' || /^placeholder\b/i.test(altRaw)) continue
        const srcM = tag.match(/\bsrc=["']([^"']*)["']/i)
        const dsM = tag.match(/\bdata-src=["']([^"']*)["']/i)
        const lazyM = tag.match(/\bdata-lazy-src=["']([^"']*)["']/i)
        const ssetM = tag.match(/\bsrcset=["']([^"']+)["']/i)
        const fromSet = bestUrlFromSrcsetString(ssetM ? ssetM[1] : '')
        for (const raw of [srcM?.[1], dsM?.[1], lazyM?.[1], fromSet].filter(Boolean)) {
          const n = normalizeRssImgSrcFromHtml(raw, item)
          const s = scoreRssThumbnailCandidate(n, itemLink)
          if (s > bestPickScore) {
            bestPickScore = s
            bestPick = n
          }
        }
      }
      const ogMatch =
        description.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
        description.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
      if (ogMatch?.[1]) {
        const ogNorm = normalizeRssImgSrcFromHtml(ogMatch[1], item)
        const ogScore = scoreRssThumbnailCandidate(ogNorm, itemLink)
        if (ogScore > bestPickScore) {
          bestPickScore = ogScore
          bestPick = ogNorm
        }
      }
      if (bestPickScore >= 0) return bestPick
    }
  }
  
  // Second attempt: Scan all elements for type="image" or type containing "image"
  // This helps identify thumbnail elements that might not match standard selectors
  try {
    const allElements = item.querySelectorAll('*')
    for (const element of allElements) {
      const typeAttr = element.getAttribute('type')
      if (typeAttr && typeAttr.toLowerCase().includes('image')) {
        // Found an element with type containing "image", try to extract URL
        // Check common attributes that might contain the image URL
        thumbnail = element.getAttribute('url') || 
                   element.getAttribute('href') || 
                   element.getAttribute('src') ||
                   element.getAttribute('content') ||
                   element.textContent?.trim() || ''
        
        if (thumbnail && 
            !thumbnail.startsWith('data:') && 
            (thumbnail.startsWith('http://') || thumbnail.startsWith('https://') || thumbnail.startsWith('//'))) {
          // Clean up protocol-relative URLs
          if (thumbnail.startsWith('//')) {
            thumbnail = 'https:' + thumbnail
          }
          return thumbnail
        }
      }
    }
  } catch (e) {
    // If scanning fails, continue to return empty string
  }
  
  return ''
}

// Channel / feed logo (RSS 2.0 <channel><image><url>, Atom <logo> / <icon>)
const extractFeedImageFromDoc = (xmlDoc) => {
  const normalizeFeedImageUrl = (raw) => {
    if (!raw) return ''
    let u = String(raw).trim()
    if (!u) return ''
    if (u.startsWith('//')) u = `https:${u}`
    if (!/^https?:\/\//i.test(u) || u.length < 10) return ''
    return u
  }

  const channel = xmlDoc.querySelector('channel')
  if (channel) {
    for (const child of channel.children) {
      if (child.localName !== 'image') continue
      for (const sub of child.children) {
        if (sub.localName === 'url') {
          const u = normalizeFeedImageUrl(sub.textContent)
          if (u) return u
        }
      }
    }
  }

  const feed = xmlDoc.querySelector('feed')
  if (feed) {
    for (const child of feed.children) {
      if (child.localName === 'logo') {
        const u = normalizeFeedImageUrl(child.textContent)
        if (u) return u
      }
      if (child.localName === 'icon') {
        const u = normalizeFeedImageUrl(child.getAttribute('src') || child.textContent)
        if (u) return u
      }
    }
  }

  return ''
}

/** Card teaser length (plain text). Full body stays in descriptionFull / content for expand. */
const MAX_RSS_DESCRIPTION_PREVIEW = 320

/** Short teaser for cards; full plain text is kept separately for "more…". */
const truncateRssDescriptionPreview = (plain) => {
  if (!plain || plain.length <= MAX_RSS_DESCRIPTION_PREVIEW) return plain
  const truncated = plain.substring(0, MAX_RSS_DESCRIPTION_PREVIEW)
  const lastSentence = truncated.lastIndexOf('. ')
  const lastParagraph = truncated.lastIndexOf('</p>')
  const cutPoint = Math.max(lastSentence, lastParagraph > 0 ? lastParagraph + 4 : 0)
  let out
  if (cutPoint > MAX_RSS_DESCRIPTION_PREVIEW * 0.6) {
    out = plain.substring(0, cutPoint).trim()
  } else {
    const lastSpace = truncated.lastIndexOf(' ')
    if (lastSpace > MAX_RSS_DESCRIPTION_PREVIEW * 0.7) {
      out = truncated.substring(0, lastSpace).trim()
    } else {
      out = truncated.trim()
    }
  }
  if (!out.endsWith('...') && !out.endsWith('.')) {
    out += '...'
  }
  return out
}

/** Postmedia / partner feeds: content:encoded is often a short truncate with “Read More” + leaked CDATA. */
const stripFeedExcerptBoilerplate = (plain, rawHtml = '') => {
  let t = (plain || '').trim()
  if (!t) return t
  if (/truncated_content|utm_campaign=truncated/i.test(rawHtml)) {
    t = t.replace(/\s*Read More\s*$/i, '').trim()
  }
  t = t.replace(/\s*\]\]\s*>\s*$/g, '').replace(/\s*Read More\s*$/i, '').trim()
  return t
}

const longerPlainFragment = (a, b) => {
  const A = (a || '').trim()
  const B = (b || '').trim()
  return B.length > A.length ? B : A
}

/** Card “more…” body: combine channel description + content:encoded when they differ (avoid picking only the stub). */
const mergeRssDescriptionAndContent = (descPlain, encPlain) => {
  const d = (descPlain || '').trim()
  const e = (encPlain || '').trim()
  if (!d) return e
  if (!e) return d
  const minOverlap = 24
  if (e.length >= minOverlap && d.includes(e)) return d
  if (d.length >= minOverlap && e.includes(d)) return e
  const longer = d.length >= e.length ? d : e
  const shorter = d.length >= e.length ? e : d
  const norm = (s) => s.replace(/\s+/g, ' ').trim()
  const longN = norm(longer)
  const shortN = norm(shorter)
  if (shorter.length >= minOverlap && shortN.length >= minOverlap && longN.endsWith(shortN)) {
    return longer
  }
  return `${longer}\n\n${shorter}`
}

/**
 * Resolve feed-level logo when RSS has no channel image: homepage HTML, Wikimedia, favicon.ico.
 * Uses localStorage + 3h probe window to avoid repeated requests to the same sites.
 * @returns {Promise<{ url: string, tier: string }>}
 */
const resolveFallbackFeedLogo = async (source, channelSiteUrl) => {
  const feedUrl = source.url
  const entry = loadFeedLogoEntry(feedUrl)

  if (entry && !shouldRunFeedLogoNetworkProbe(entry)) {
    return {
      url: entry.logoUrl ? String(entry.logoUrl) : '',
      tier: entry.tier || 'cached',
    }
  }

  let url = ''
  let tier = 'none'

  url = await resolveSiteLogoFromMarketingPages(feedUrl, channelSiteUrl)
  if (url) tier = 'homepage'

  if (!url && source.name) {
    url = await resolveLogoViaWikimediaCommons(source.name)
    if (url) tier = 'wikimedia'
  }

  if (!url) {
    const candidates = buildFaviconUrlCandidates(feedUrl, channelSiteUrl)
    for (const fav of candidates) {
      const ok = await verifyRemoteImageUrl(fav)
      if (ok) {
        url = fav
        tier = 'favicon'
        break
      }
    }
  }

  saveFeedLogoEntry(feedUrl, { logoUrl: url || null, tier })
  return { url, tier }
}

const getAtomEntryLink = (entry) => {
  const links = [...entry.querySelectorAll('link')]
  const href =
    links.find((l) => (l.getAttribute('rel') || 'alternate') === 'alternate')?.getAttribute('href') ||
    links.find((l) => !l.getAttribute('rel'))?.getAttribute('href') ||
    entry.querySelector('link[href]')?.getAttribute('href') ||
    ''
  return (href || '').trim()
}

const atomElementToPlainAndHtml = (el) => {
  if (!el) return { plain: '', rawHtml: '' }
  const type = (el.getAttribute('type') || 'text').toLowerCase()
  const inner = el.innerHTML || ''
  const text = el.textContent || ''
  if (type.includes('html') || type === 'xhtml' || (inner && inner.includes('<'))) {
    const plain = stripHtmlTags(inner || text)
    return { plain: plain.trim(), rawHtml: inner }
  }
  return { plain: decodeHtmlEntities(text.trim()), rawHtml: '' }
}

/** Atom 1.0 <entry> → same article shape as {@link parseRssItem} */
const parseAtomEntry = (entry, source, feedImageUrl = '', feedLogoTier = 'rss') => {
  const titleEl = entry.querySelector('title')
  let title = titleEl?.textContent?.trim() || ''
  if (titleEl?.innerHTML && !title) {
    title = stripHtmlTags(titleEl.innerHTML)
  }
  title = decodeHtmlEntities(title.trim())

  const link = getAtomEntryLink(entry)
  const pubDate =
    entry.querySelector('published')?.textContent?.trim() ||
    entry.querySelector('updated')?.textContent?.trim() ||
    ''

  const sum = atomElementToPlainAndHtml(entry.querySelector('summary'))
  const cont = atomElementToPlainAndHtml(entry.querySelector('content'))
  let descriptionPlainFull = longerPlainFragment(sum.plain, cont.plain)
  const mediaDescPlain = decodeHtmlEntities(
    entry.getElementsByTagNameNS('http://search.yahoo.com/mrss/', 'description')[0]?.textContent?.trim() ||
      ''
  )
  if (mediaDescPlain) {
    descriptionPlainFull = longerPlainFragment(descriptionPlainFull, mediaDescPlain)
  }
  const descriptionRawHtmlForThumb = sum.rawHtml || cont.rawHtml || ''
  const content = cont.plain.length >= sum.plain.length ? cont.plain : sum.plain

  if (!descriptionPlainFull && content) {
    descriptionPlainFull = content
  }
  if (!descriptionPlainFull && title) {
    descriptionPlainFull = title
  }

  let thumbnail = extractThumbnail(entry, descriptionRawHtmlForThumb)

  const guid = entry.querySelector('id')?.textContent?.trim() || ''
  const author = decodeHtmlEntities(
    entry.querySelector('author > name')?.textContent?.trim() ||
      entry.querySelector('author')?.textContent?.trim() ||
      entry.querySelector('dc\\:creator')?.textContent?.trim() ||
      ''
  )

  const teaserPlain = longerPlainFragment(descriptionPlainFull, content)
  let description = truncateRssDescriptionPreview(teaserPlain)

  if (!title && description) {
    title = description
    description = truncateRssDescriptionPreview(longerPlainFragment(descriptionPlainFull, content))
  }

  const categories = extractCategories(entry, source)
  const descriptionExpandFull = mergeRssDescriptionAndContent(descriptionPlainFull, content)

  if (thumbnail) {
    thumbnail = thumbnail.trim()
    if (
      thumbnail === '' ||
      thumbnail.startsWith('data:') ||
      thumbnail.length < 10 ||
      !thumbnail.match(/^https?:\/\//i)
    ) {
      thumbnail = ''
    }
  } else {
    thumbnail = ''
  }

  let feedLogo = ''
  if (feedImageUrl) {
    const t = feedImageUrl.trim()
    if (t && !t.startsWith('data:') && t.length >= 10 && /^https?:\/\//i.test(t)) {
      feedLogo = t
    }
  }

  let publishedAt = new Date(pubDate)
  if (isNaN(publishedAt.getTime())) {
    return null
  }

  const now = new Date()
  const hoursDiff = (now.getTime() - publishedAt.getTime()) / (1000 * 60 * 60)
  if (hoursDiff > 24 || hoursDiff < 0) {
    return null
  }

  if (!link) {
    return null
  }

  const itemId = guid || `${link}-${title}`

  let normalizedLanguage = source.language || 'en'
  if (normalizedLanguage.startsWith('fr')) {
    normalizedLanguage = 'fr'
  } else if (normalizedLanguage.startsWith('en')) {
    normalizedLanguage = 'en'
  } else {
    normalizedLanguage = 'en'
  }

  return {
    id: itemId,
    title,
    link,
    pubDate,
    description,
    descriptionFull: descriptionExpandFull,
    guid,
    author,
    categories,
    content: content || '',
    thumbnail,
    feedLogo,
    feedLogoTier: feedLogo ? feedLogoTier : '',
    source: source.name,
    language: normalizedLanguage,
    region: source.region || '',
    publishedAt,
    popularityScore: 0,
    shareCount: 0,
    syndicationFormat: 'atom',
  }
}

// Parse RSS item into news article object
const parseRssItem = (item, source, feedImageUrl = '', feedLogoTier = 'rss') => {
  // Get title - try multiple methods
  // Some feeds (like UOL) don't have title elements, use description as fallback
  const titleElement = item.querySelector('title')
  let title = ''
  if (titleElement) {
    // Try textContent first (handles CDATA automatically)
    title = titleElement.textContent || ''
    // If empty, try innerHTML (might be CDATA or HTML)
    if (!title && titleElement.innerHTML) {
      title = stripHtmlTags(titleElement.innerHTML)
    }
    // If still empty, try innerText as fallback
    if (!title && titleElement.innerText) {
      title = titleElement.innerText
    }
    title = decodeHtmlEntities(String(title).trim())
    // Title with markup (CDATA HTML): textarea decode can yield empty — strip tags to plain headline.
    if (title.includes('<')) {
      title = stripHtmlTags(title).trim()
    }
  }
  
  const link = item.querySelector('link')?.textContent || ''
  const pubDate = item.querySelector('pubDate')?.textContent || ''

  // Full plain text from <description> (never truncated here) + raw HTML for thumbnail discovery
  const descriptionElement = item.querySelector('description')
  let descriptionPlainFull = ''
  let descriptionRawHtmlForThumb = ''

  if (descriptionElement) {
    let descText = descriptionElement.textContent || ''
    let descInnerHTML = descriptionElement.innerHTML || ''

    if (!descText && descInnerHTML) {
      if (descInnerHTML.includes('<![CDATA[')) {
        descText = descInnerHTML.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
      } else {
        descText = descInnerHTML
      }
    }

    if (descInnerHTML.includes('<![CDATA[')) {
      descriptionRawHtmlForThumb = descInnerHTML.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    } else {
      descriptionRawHtmlForThumb = descInnerHTML
    }

    if (descInnerHTML && descInnerHTML !== descText && descInnerHTML.includes('<') && !descInnerHTML.includes('<![CDATA[')) {
      descriptionPlainFull = stripHtmlTags(descInnerHTML)
    } else if (descText) {
      descriptionPlainFull = decodeHtmlEntities(descText)
    }

    if (!descriptionPlainFull && descriptionElement.innerText) {
      descriptionPlainFull = decodeHtmlEntities(descriptionElement.innerText)
    }

    if (!descriptionPlainFull && descriptionElement.childNodes.length > 0) {
      const textNodes = Array.from(descriptionElement.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE || node.nodeType === Node.CDATA_SECTION_NODE)
        .map((node) => node.textContent || node.nodeValue || '')
        .join('')
      if (textNodes) {
        descriptionPlainFull = decodeHtmlEntities(textNodes.trim())
      }
    }

    descriptionPlainFull = descriptionPlainFull.trim()
    descriptionPlainFull = descriptionPlainFull
      .replace(/<iframe[^>]*>.*?<\/iframe>/gi, '')
      .replace(/<embed[^>]*>.*?<\/embed>/gi, '')
      .replace(/<object[^>]*>.*?<\/object>/gi, '')
      .replace(/<video[^>]*>.*?<\/video>/gi, '')
      .replace(/<audio[^>]*>.*?<\/audio>/gi, '')
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/<style[^>]*>.*?<\/style>/gi, '')
      .replace(/<core-commerce[^>]*>.*?<\/core-commerce>/gi, '')
      .trim()

    // CDATA descriptions: decodeHtmlEntities leaves literal <p>/<img> when raw === textContent.
    if (descriptionPlainFull.includes('<')) {
      descriptionPlainFull = stripHtmlTags(descriptionPlainFull)
    }
  }

  const guid = item.querySelector('guid')?.textContent || ''
  const author = decodeHtmlEntities(
    item.querySelector('author')?.textContent ||
      item.querySelector('dc\\:creator')?.textContent ||
      item.querySelector('creator')?.textContent ||
      ''
  )

  const contentElement = item.querySelector('content\\:encoded') || item.querySelector('encoded')
  let content = ''
  let contentRawHtml = ''
  if (contentElement) {
    const contentText = contentElement.textContent || ''
    const contentInnerHTML = contentElement.innerHTML || ''
    if (contentInnerHTML.includes('<![CDATA[')) {
      contentRawHtml = contentInnerHTML.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    } else {
      contentRawHtml = contentInnerHTML
    }
    // CDATA markup: textContent and unwrapped innerHTML are often identical; still strip tags.
    if (contentRawHtml.includes('<')) {
      content = stripHtmlTags(contentRawHtml)
    } else {
      content = decodeHtmlEntities(contentText)
    }
    content = stripFeedExcerptBoilerplate(content.trim(), contentRawHtml)
  }

  // Match mobile rssParse: WordPress/Postmedia often put teaser in <description>, hero <img> in content:encoded
  const thumbnailHtmlCombined = [descriptionRawHtmlForThumb, contentRawHtml]
    .filter((s) => s && String(s).trim())
    .join('\n')
  let thumbnail = extractThumbnail(item, thumbnailHtmlCombined)

  const MAX_CONTENT_SIZE = 50 * 1024 // 50KB
  if (content.length > MAX_CONTENT_SIZE) {
    console.warn(`[${source.name}] Content too long (${content.length} chars), truncating to ${MAX_CONTENT_SIZE}`)
    content = content.substring(0, MAX_CONTENT_SIZE) + '...'
  }

  if (!descriptionPlainFull && content) {
    descriptionPlainFull = content
  }

  // Teaser: many feeds put the main lede in content:encoded and a different line in <description> (e.g. Postmedia).
  const teaserPlain = longerPlainFragment(descriptionPlainFull, content)
  let description = truncateRssDescriptionPreview(teaserPlain)

  // No title: use teaser as title; prefer content:encoded for full body + short teaser
  if (!title && description) {
    title = description
    if (content) {
      if (content.length >= descriptionPlainFull.length) {
        descriptionPlainFull = content
      }
      description = truncateRssDescriptionPreview(
        longerPlainFragment(descriptionPlainFull, content)
      )
    } else {
      description = ''
    }
  }

  // UOL / similar: <title> empty and plain-text path lost the lede (entities, markup-only bodies, DOM quirks).
  // Match mobile rssParse — recover headline from raw description / content:encoded HTML.
  if (!title.trim()) {
    const fromDescRaw = stripHtmlTags(descriptionRawHtmlForThumb || '').trim()
    const fromEncRaw = stripHtmlTags(contentRawHtml || '').trim()
    const fromRaw = longerPlainFragment(fromDescRaw, fromEncRaw)
    if (fromRaw) {
      const oneLine = fromRaw.replace(/\s+/g, ' ').trim()
      title = oneLine.length > 300 ? `${oneLine.slice(0, 297).trimEnd()}…` : oneLine
      if (!descriptionPlainFull.trim()) {
        descriptionPlainFull = fromRaw
      }
      if (!description.trim()) {
        description = truncateRssDescriptionPreview(
          longerPlainFragment(descriptionPlainFull, content)
        )
      }
    }
  }

  const categories = extractCategories(item, source)

  const descriptionExpandFull = mergeRssDescriptionAndContent(descriptionPlainFull, content)

  // Clean up thumbnail - remove empty strings, whitespace, and invalid URLs
  if (thumbnail) {
    thumbnail = thumbnail.trim()
    // Filter out obviously invalid thumbnails
    if (thumbnail === '' || 
        thumbnail.startsWith('data:') || 
        thumbnail.length < 10 || // Too short to be a valid URL
        !thumbnail.match(/^https?:\/\//i)) { // Must start with http:// or https://
      thumbnail = ''
    }
  } else {
    thumbnail = ''
  }

  let feedLogo = ''
  if (feedImageUrl) {
    const t = feedImageUrl.trim()
    if (t && !t.startsWith('data:') && t.length >= 10 && /^https?:\/\//i.test(t)) {
      feedLogo = t
    }
  }
  
  // Debug logging for thumbnails (only in development)
  if (process.env.NODE_ENV === 'development' && thumbnail) {
  }
  
  // Extract popularity metrics from RSS if available
  let popularityScore = 0
  const shareCount = item.querySelector('shareCount')?.textContent || 
                    item.querySelector('socialCount')?.textContent || 
                    item.querySelector('engagement')?.textContent || ''
  const facebookShares = item.querySelector('facebookShares')?.textContent || 
                       item.querySelector('fbShares')?.textContent || '0'
  const twitterShares = item.querySelector('twitterShares')?.textContent || 
                      item.querySelector('tweetCount')?.textContent || '0'
  
  if (shareCount) popularityScore += parseInt(shareCount) || 0
  if (facebookShares) popularityScore += parseInt(facebookShares) * 2 || 0
  if (twitterShares) popularityScore += parseInt(twitterShares) || 0
  
  // Parse date
  let publishedAt = new Date(pubDate)
  if (isNaN(publishedAt.getTime())) {
    publishedAt = new Date(pubDate.replace(/(\d{4})-(\d{2})-(\d{2})/, '$1/$2/$3'))
    if (isNaN(publishedAt.getTime())) {
      return null // Invalid date, skip this item
    }
  }
  
  // Filter to only recent news (last 24 hours instead of strict "today")
  // This is more flexible and accounts for timezone differences
  const now = new Date()
  const articleDate = new Date(publishedAt)
  const hoursDiff = (now.getTime() - articleDate.getTime()) / (1000 * 60 * 60)
  
  // Only show articles from the last 24 hours
  if (hoursDiff > 24 || hoursDiff < 0) {
    return null // Too old or future date, skip
  }
  
  const itemId = guid || `${link}-${title}`
  
  // Normalize language code (e.g., 'fr-FR' -> 'fr', 'en-US' -> 'en')
  let normalizedLanguage = source.language || 'en'
  if (normalizedLanguage.startsWith('fr')) {
    normalizedLanguage = 'fr'
  } else if (normalizedLanguage.startsWith('en')) {
    normalizedLanguage = 'en'
  } else {
    // Default to 'en' if language is unknown
    normalizedLanguage = 'en'
  }
  
  return {
    id: itemId,
    title,
    link,
    pubDate,
    description,
    descriptionFull: descriptionExpandFull,
    guid,
    author,
    categories,
    content,
    thumbnail,
    feedLogo,
    feedLogoTier: feedLogo ? feedLogoTier : '',
    source: source.name, // Outlet name
    language: normalizedLanguage, // Normalized language code
    region: source.region || '', // City/region
    publishedAt,
    popularityScore,
    shareCount: parseInt(shareCount) || 0,
    syndicationFormat: 'rss2',
  }
}

/** UUID v4 for RSS batch correlation; avoids crypto.randomUUID (missing in some browsers / HTTP contexts). */
export function createRssBatchId() {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID()
  }
  const bytes = new Uint8Array(16)
  if (c && typeof c.getRandomValues === 'function') {
    c.getRandomValues(bytes)
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256)
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const h = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** Notify backend after a full tab refresh so it can log total bytes for that batch (see server batch-complete). */
export function notifyRssBatchComplete(batchId) {
  if (!batchId || typeof batchId !== 'string') return
  const body = JSON.stringify({ batchId })
  fetch('/api/proxy/batch-complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {})
}

// Fetch RSS feed from a single source with retry logic for rate limiting
// Returns { news: [], error: { name, message, status } | null }
export const fetchRssFeed = async (source, { maxRetries = 2, batchId = null } = {}) => {
  const sourceNews = []
  
  // Retry logic for rate limiting (429 errors)
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      let response = null
      let text = null
      
      // Use backend proxy to avoid CORS issues
      // The backend server fetches RSS feeds server-side, avoiding browser CORS restrictions
      try {
        let proxyUrl = `/api/proxy/rss?url=${encodeURIComponent(source.url)}`
        if (batchId) {
          proxyUrl += `&batch=${encodeURIComponent(batchId)}`
        }
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout
        
        response = await fetch(proxyUrl, {
          signal: controller.signal,
          headers: {
            Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*',
          },
        })
        
        clearTimeout(timeoutId)
        
        // Handle rate limiting (429) with retry
        if (response && response.status === 429) {
          if (attempt < maxRetries) {
            // Calculate exponential backoff: 1min, 2min, 3min
            const waitTime = (attempt + 1) * 60000
            console.warn(`[${source.name}] Rate limited (429), waiting ${waitTime}ms before retry ${attempt + 1}/${maxRetries}...`)
            await new Promise(resolve => setTimeout(resolve, waitTime))
            continue // Retry the request
          } else {
            // Max retries reached
            const error = {
              name: source.name,
              message: 'Rate limit exceeded. Please try again later.',
              status: 429
            }
            console.warn(`[${source.name}] Rate limited (429) after ${maxRetries} retries`)
            return { news: sourceNews, error }
          }
        }
        
        if (!response || !response.ok) {
          let errorData = { message: 'Unknown error' }
          try {
            const errorText = await response.text()
            errorData = JSON.parse(errorText)
          } catch (e) {
            errorData = { message: `HTTP ${response?.status || 'Unknown'}` }
          }
          
          const error = {
            name: source.name,
            message: errorData.error || errorData.message || `HTTP ${response?.status}`,
            status: response?.status || 500
          }
          
          console.warn(`[${source.name}] Backend proxy failed (${error.status}): ${error.message}`)
          return { news: sourceNews, error }
        }
        
        text = await response.text()
        
        // Validate it's actually XML/RSS
        const trimmedText = text.trim()
        if (!trimmedText.includes('<rss') && 
            !trimmedText.includes('<feed') && 
            !trimmedText.includes('<?xml') &&
            !trimmedText.includes('<RDF')) {
          console.warn(`[${source.name}] Backend proxy returned non-XML content`)
          const error = {
            name: source.name,
            message: 'Invalid RSS feed format',
            status: 500
          }
          return { news: sourceNews, error }
        }
        
      } catch (err) {
        // Backend proxy failed - retry if not last attempt
        if (attempt < maxRetries && err.name !== 'AbortError') {
          const waitTime = (attempt + 1) * 1000 // Shorter wait for network errors
          console.warn(`[${source.name}] Network error, retrying in ${waitTime}ms...`)
          await new Promise(resolve => setTimeout(resolve, waitTime))
          continue
        }
        
        const error = {
          name: source.name,
          message: err.name === 'AbortError' ? 'Request timeout' : (err.message || 'Network error'),
          status: err.name === 'AbortError' ? 504 : 500
        }
        
        if (err.name === 'AbortError') {
          console.warn(`[${source.name}] Backend proxy request timeout`)
        } else {
          console.warn(`[${source.name}] Backend proxy error: ${err.message || err}`)
        }
        return { news: sourceNews, error }
      }
      
      // If we don't have text at this point, proxy failed
      if (!text) {
        const error = {
          name: source.name,
          message: 'Empty response',
          status: 500
        }
        console.warn(`[${source.name}] Failed to fetch feed: ${source.url}`)
        return { news: sourceNews, error }
      }
      
      // Parse the XML we got
      // The server now sends Content-Type with charset=utf-8 and normalizes XML declaration
      // Ensure the XML declaration specifies UTF-8 for proper character encoding
      let xmlText = text
      if (xmlText.trim().startsWith('<?xml')) {
        // Ensure encoding is UTF-8 in XML declaration
        xmlText = xmlText.replace(
          /<\?xml\s+version=["']([^"']+)["'](\s+encoding=["'][^"']+["'])?/i,
          '<?xml version="$1" encoding="UTF-8"'
        )
      } else {
        // No XML declaration, add one with UTF-8
        xmlText = '<?xml version="1.0" encoding="UTF-8"?>\n' + xmlText
      }
      
      const parser = new DOMParser()
      // DOMParser will use the encoding specified in the XML declaration (UTF-8)
      const xmlDoc = parser.parseFromString(xmlText, 'text/xml')
      
      const parseError = xmlDoc.querySelector('parsererror')
      if (parseError) {
        const itemCount = xmlDoc.querySelectorAll('item').length
        const entryCount = xmlDoc.querySelectorAll('entry').length
        if (itemCount === 0 && entryCount === 0) {
          if (process.env.NODE_ENV === 'development') {
            const errorText = parseError.textContent || ''
            if (!errorText.includes('mismatch') && !errorText.includes('invalid')) {
              // minor noise suppressed
            }
          }
          return { news: sourceNews, error: null }
        }
      }

      const rssRoot = xmlDoc.querySelector('rss')
      const atomRoot = xmlDoc.querySelector('feed')
      const useAtom = Boolean(atomRoot && !rssRoot)

      const channelSiteUrl = extractChannelSiteUrlFromXmlDoc(xmlDoc)
      const rssChannelImage = extractFeedImageFromDoc(xmlDoc)
      const pinnedFeedLogo = getPermanentFeedLogoUrl(source.url)
      let feedImageUrl = ''
      let feedLogoTier = 'none'
      if (pinnedFeedLogo) {
        feedImageUrl = pinnedFeedLogo
        feedLogoTier = 'pinned'
      } else if (rssChannelImage) {
        feedImageUrl = rssChannelImage
        feedLogoTier = 'rss'
      } else {
        const resolved = await resolveFallbackFeedLogo(source, channelSiteUrl)
        feedImageUrl = resolved.url || ''
        feedLogoTier = resolved.tier || 'none'
      }

      if (useAtom) {
        const entryList = atomRoot.querySelectorAll('entry')
        entryList.forEach((entry) => {
          const parsedItem = parseAtomEntry(entry, source, feedImageUrl, feedLogoTier)
          if (parsedItem) {
            sourceNews.push(parsedItem)
          }
        })

        if (sourceNews.length === 0 && entryList.length > 0) {
          console.warn(
            `[${source.name}] Parsed ${entryList.length} Atom entries but none matched the date filter (last 24 hours)`
          )
          const sampleDates = Array.from(entryList)
            .slice(0, 3)
            .map(
              (entry) =>
                entry.querySelector('published')?.textContent ||
                entry.querySelector('updated')?.textContent ||
                'No date found'
            )
          console.warn(`[${source.name}] Sample entry dates:`, sampleDates)
        } else if (entryList.length === 0) {
          console.warn(`[${source.name}] Atom feed contains no entries`)
        }
      } else {
        const items = xmlDoc.querySelectorAll('item')
        items.forEach((item) => {
          const parsedItem = parseRssItem(item, source, feedImageUrl, feedLogoTier)
          if (parsedItem) {
            sourceNews.push(parsedItem)
          }
        })

        if (sourceNews.length === 0 && items.length > 0) {
          console.warn(
            `[${source.name}] Parsed ${items.length} items but none matched the date filter (last 24 hours)`
          )
          const sampleDates = Array.from(items)
            .slice(0, 3)
            .map((item) => {
              const pubDate =
                item.querySelector('pubDate')?.textContent ||
                item.querySelector('published')?.textContent ||
                item.querySelector('dc\\:date')?.textContent ||
                'No date found'
              return pubDate
            })
          console.warn(`[${source.name}] Sample article dates:`, sampleDates)
        } else if (items.length === 0) {
          console.warn(`[${source.name}] Feed contains no items`)
        }
      }

      return { news: sourceNews, error: null }
      
    } catch (err) {
      // Only log unexpected errors (not timeouts, which are handled above)
      if (attempt === maxRetries) {
        const error = {
          name: source.name,
          message: err.message || 'Unexpected error',
          status: 500
        }
        
        if (err.name !== 'AbortError' && process.env.NODE_ENV === 'development') {
          console.debug(`[${source.name}] Unexpected error:`, err.message || err)
        }
        return { news: sourceNews, error }
      }
      // Retry on unexpected errors (except abort)
      if (err.name !== 'AbortError') {
        const waitTime = (attempt + 1) * 1000
        console.warn(`[${source.name}] Unexpected error, retrying in ${waitTime}ms...`)
        await new Promise(resolve => setTimeout(resolve, waitTime))
        continue
      }
      // AbortError - don't retry
      const error = {
        name: source.name,
        message: 'Request timeout',
        status: 504
      }
      return { news: sourceNews, error }
    }
  }
  
  // Should never reach here, but just in case
  return { news: sourceNews, error: { name: source.name, message: 'Max retries exceeded', status: 500 } }
}
