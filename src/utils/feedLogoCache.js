/**
 * Per-feed RSS URL cache for fallback logos (homepage / Wikimedia / favicon).
 * Avoids hammering external sites: at most one network probe every 3 hours per feed.
 */

const STORAGE_KEY = 'actufeed-feed-logo-cache-v1'
export const FEED_LOGO_PROBE_INTERVAL_MS = 3 * 60 * 60 * 1000

/**
 * @typedef {{ logoUrl: string | null, tier: string, nextProbeAt: number }} FeedLogoCacheEntry
 */

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

function writeAll(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch (e) {
    console.warn('[feedLogoCache] Failed to save:', e)
  }
}

/**
 * @param {string} feedUrl - source.url (RSS URL)
 * @returns {FeedLogoCacheEntry | null}
 */
export function loadFeedLogoEntry(feedUrl) {
  if (!feedUrl) return null
  const all = readAll()
  const e = all[feedUrl]
  if (!e || typeof e !== 'object') return null
  return {
    logoUrl: e.logoUrl === null || e.logoUrl === undefined ? null : String(e.logoUrl),
    tier: typeof e.tier === 'string' ? e.tier : 'unknown',
    nextProbeAt: typeof e.nextProbeAt === 'number' ? e.nextProbeAt : 0,
  }
}

/**
 * @param {string} feedUrl
 * @param {{ logoUrl: string | null, tier: string }} result
 */
export function saveFeedLogoEntry(feedUrl, result) {
  if (!feedUrl) return
  const all = readAll()
  all[feedUrl] = {
    logoUrl: result.logoUrl || null,
    tier: result.tier || 'none',
    nextProbeAt: Date.now() + FEED_LOGO_PROBE_INTERVAL_MS,
  }
  writeAll(all)
}

/** True if we should run homepage / Wikimedia / favicon network resolution again. */
export function shouldRunFeedLogoNetworkProbe(entry) {
  if (!entry) return true
  return Date.now() >= (entry.nextProbeAt || 0)
}

/**
 * Build /favicon.ico candidates (feed host, then channel site host).
 * @param {string} feedUrl
 * @param {string} channelSiteUrl
 * @returns {string[]}
 */
export function buildFaviconUrlCandidates(feedUrl, channelSiteUrl) {
  const origins = []
  const add = (href) => {
    try {
      const u = new URL(href)
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return
      const o = u.origin
      if (!origins.includes(o)) origins.push(o)
    } catch {
      // ignore
    }
  }
  if (feedUrl) add(feedUrl)
  if (channelSiteUrl) add(channelSiteUrl)
  return origins.map((o) => `${o}/favicon.ico`)
}
