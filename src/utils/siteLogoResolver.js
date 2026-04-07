/**
 * Discover a site / outlet logo when the RSS channel has no <image>.
 * Fetches marketing HTML via the same backend proxy as RSS (SSRF-safe) and
 * scores candidates from JSON-LD, apple-touch-icon, favicons, etc.
 */

import { apiUrl } from './apiBase'

const LOGO_PATH_HINT = /logo|brand|wordmark|masthead|lockup|site-icon|apple-touch|favicon/i

const parseLinkSizes = (sizesAttr) => {
  if (!sizesAttr || typeof sizesAttr !== 'string') return 0
  let maxArea = 0
  for (const part of sizesAttr.trim().split(/\s+/)) {
    const m = part.match(/^(\d+)x(\d+)$/i)
    if (m) {
      const area = parseInt(m[1], 10) * parseInt(m[2], 10)
      if (area > maxArea) maxArea = area
    }
  }
  return maxArea
}

const normalizeUrl = (raw, baseUrl) => {
  if (!raw || typeof raw !== 'string') return ''
  let u = raw.trim()
  if (!u || u.startsWith('data:') || u.startsWith('javascript:')) return ''
  if (u.startsWith('//')) u = `https:${u}`
  try {
    if (/^https?:\/\//i.test(u)) return u
    return new URL(u, baseUrl).href
  } catch {
    return ''
  }
}

const isLikelyImageUrl = (url) =>
  /^https?:\/\//i.test(url) && url.length >= 12 && url.length < 2048 && !url.startsWith('data:')

function flattenJsonLdNodes(node, out = []) {
  if (node == null) return out
  if (Array.isArray(node)) {
    for (const x of node) flattenJsonLdNodes(x, out)
    return out
  }
  if (typeof node === 'object') {
    out.push(node)
    if (node['@graph']) flattenJsonLdNodes(node['@graph'], out)
  }
  return out
}

function pushLogoFromNode(logo, score, bucket) {
  if (!logo) return
  if (typeof logo === 'string') {
    bucket.push({ url: logo, score })
    return
  }
  if (typeof logo === 'object' && logo.url) {
    bucket.push({ url: logo.url, score })
  }
}

function extractJsonLdLogos(doc, baseUrl) {
  const scored = []
  const scripts = doc.querySelectorAll('script[type="application/ld+json"]')
  for (const script of scripts) {
    const raw = script.textContent?.trim()
    if (!raw) continue
    try {
      const data = JSON.parse(raw)
      const nodes = flattenJsonLdNodes(data, [])
      for (const node of nodes) {
        if (!node || typeof node !== 'object') continue
        const types = node['@type']
        const tlist = Array.isArray(types) ? types : types != null ? [types] : []
        const isOrgLike = tlist.some((t) =>
          /Organization|NewsMediaOrganization|Brand|WebSite|Periodical|NewsMedia/i.test(String(t))
        )
        const isArticleLike = tlist.some((t) => /NewsArticle|BlogPosting|Article/i.test(String(t)))
        if (!isOrgLike && !isArticleLike) continue
        // Avoid using a story hero image as the outlet logo
        if (isOrgLike && !isArticleLike) pushLogoFromNode(node.logo, 100, scored)
        if (node.publisher && typeof node.publisher === 'object') {
          pushLogoFromNode(node.publisher.logo, 96, scored)
        }
        if (node.isPartOf && typeof node.isPartOf === 'object') {
          pushLogoFromNode(node.isPartOf.logo, 94, scored)
        }
      }
    } catch {
      // invalid JSON-LD block
    }
  }
  return scored.map(({ url, score }) => ({ url: normalizeUrl(url, baseUrl), score })).filter((x) => isLikelyImageUrl(x.url))
}

function extractMetaLogos(doc, baseUrl) {
  const scored = []
  const pushMeta = (content, score) => {
    const u = normalizeUrl(content, baseUrl)
    if (isLikelyImageUrl(u)) scored.push({ url: u, score })
  }

  const ogImage = doc.querySelector('meta[property="og:image"]')?.getAttribute('content')
  if (ogImage) {
    const bonus = LOGO_PATH_HINT.test(ogImage) ? 48 : 18
    pushMeta(ogImage, bonus)
  }

  const ogLogo = doc.querySelector('meta[property="og:logo"]')?.getAttribute('content')
  if (ogLogo) pushMeta(ogLogo, 92)

  const msTile = doc.querySelector('meta[name="msapplication-TileImage"]')?.getAttribute('content')
  if (msTile) pushMeta(msTile, 78)

  // Twitter/X card image — on homepages often the outlet wordmark (e.g. Livemint's newschemalogo.png)
  const twitterImage =
    doc.querySelector('meta[name="twitter:image:src"]')?.getAttribute('content') ||
    doc.querySelector('meta[name="twitter:image"]')?.getAttribute('content')
  if (twitterImage) {
    const bonus = LOGO_PATH_HINT.test(twitterImage) ? 50 : 10
    pushMeta(twitterImage, 84 + bonus)
  }

  return scored
}

/**
 * Parse HTML and pick the best absolute image URL for a site logo.
 * @param {string} html
 * @param {string} pageUrl - URL that was fetched (used as base for relatives)
 * @returns {string}
 */
export function pickBestLogoUrlFromHtml(html, pageUrl) {
  if (!html || !pageUrl) return ''

  let doc
  try {
    doc = new DOMParser().parseFromString(html, 'text/html')
  } catch {
    return ''
  }

  const baseEl = doc.querySelector('base[href]')
  const baseUrl = normalizeUrl(baseEl?.getAttribute('href') || '', pageUrl) || pageUrl

  const scored = []

  for (const link of doc.querySelectorAll('link[rel][href]')) {
    const rel = (link.getAttribute('rel') || '').toLowerCase()
    const href = link.getAttribute('href')
    if (!href) continue
    const abs = normalizeUrl(href, baseUrl)
    if (!isLikelyImageUrl(abs)) continue

    const sizes = parseLinkSizes(link.getAttribute('sizes'))
    const sizeBonus = Math.min(Math.log2(1 + sizes) * 2, 12)

    if (rel.includes('apple-touch-icon') || rel.includes('apple-touch-icon-precomposed')) {
      scored.push({ url: abs, score: 88 + sizeBonus })
      continue
    }
    if (rel === 'mask-icon' || rel.split(/\s+/).includes('mask-icon')) {
      scored.push({ url: abs, score: 72 + sizeBonus })
      continue
    }
    if (rel === 'icon' || rel.split(/\s+/).includes('icon') || rel.includes('shortcut icon')) {
      const type = (link.getAttribute('type') || '').toLowerCase()
      const svgBoost = type.includes('svg') ? 4 : 0
      scored.push({ url: abs, score: 68 + sizeBonus + svgBoost })
    }
  }

  scored.push(...extractJsonLdLogos(doc, baseUrl))
  scored.push(...extractMetaLogos(doc, baseUrl))

  try {
    const origin = new URL(pageUrl).origin
    const fav = `${origin}/favicon.ico`
    scored.push({ url: fav, score: 22 })
  } catch {
    // ignore
  }

  const seen = new Set()
  let best = ''
  let bestScore = -1

  for (const { url, score } of scored) {
    if (!url || seen.has(url)) continue
    seen.add(url)
    if (score > bestScore) {
      bestScore = score
      best = url
    }
  }

  return best
}

/**
 * Unique origin homepages to try (channel site from RSS, then feed URL host).
 */
export function buildMarketingPageCandidates(feedUrl, channelSiteUrl) {
  const set = new Set()
  const addOriginRoot = (href) => {
    try {
      const u = new URL(href)
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return
      set.add(`${u.origin}/`)
    } catch {
      // ignore
    }
  }
  if (channelSiteUrl) addOriginRoot(channelSiteUrl)
  if (feedUrl) addOriginRoot(feedUrl)
  return [...set]
}

/**
 * Canonical site URL from RSS/Atom channel when present (often better than feed host).
 */
export function extractChannelSiteUrlFromXmlDoc(xmlDoc) {
  const channel = xmlDoc.querySelector('channel')
  if (channel) {
    const links = channel.querySelectorAll('link')
    for (const el of links) {
      const t = el.textContent?.trim()
      if (t && /^https?:\/\//i.test(t)) return t
    }
  }
  const feed = xmlDoc.querySelector('feed')
  if (feed) {
    const alt = feed.querySelector('link[rel="alternate"]')
    const hrefAlt = alt?.getAttribute?.('href')
    if (hrefAlt && /^https?:\/\//i.test(hrefAlt)) return hrefAlt
    const anyLink = feed.querySelector('link[href]')
    const href = anyLink?.getAttribute?.('href')
    if (href && /^https?:\/\//i.test(href)) return href
  }
  return ''
}

/**
 * @param {string} feedUrl
 * @param {string} channelSiteUrl - from RSS/Atom channel link, may be empty
 * @returns {Promise<string>}
 */
export async function resolveSiteLogoFromMarketingPages(feedUrl, channelSiteUrl) {
  const pages = buildMarketingPageCandidates(feedUrl, channelSiteUrl)
  for (const pageUrl of pages) {
    try {
      const proxyUrl = apiUrl(`/api/proxy/html?url=${encodeURIComponent(pageUrl)}`)
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 12000)
      const response = await fetch(proxyUrl, {
        signal: controller.signal,
        headers: { Accept: 'text/html,*/*' },
      })
      clearTimeout(timeoutId)
      if (!response.ok) continue
      const html = await response.text()
      const logo = pickBestLogoUrlFromHtml(html, pageUrl)
      if (logo) {
        if (process.env.NODE_ENV === 'development') {
          console.debug(`[siteLogo] Resolved logo via ${pageUrl} → ${logo}`)
        }
        return logo
      }
    } catch {
      // try next candidate page
    }
  }
  return ''
}
