/**
 * Default tab sources — aligned with the native app (`actufeed-app/src/constants/defaultSources.ts`).
 * Paywall-free feeds for a smooth first launch.
 */

/** @param {{ name: string, url: string, language?: string, region?: string, country?: string, province?: string }} s */
export function sourceToWebCatalogShape(s) {
  return {
    name: s.name,
    url: s.url,
    language: s.language || 'en',
    region: s.region || '',
    country: s.country || '',
    province: s.province || '',
  }
}

export const MONTREAL_DEFAULT_SOURCES = [
  {
    name: 'CBC Montreal',
    url: 'https://www.cbc.ca/webfeed/rss/rss-canada-montreal',
    language: 'en',
    region: 'Montreal',
  },
  {
    "name": "Global News Montreal",
    "url": "https://globalnews.ca/montreal/feed/",
    "language": "en",
    "region": "Montreal",
  },
  {
    name: 'Montreal Gazette',
    url: 'https://montrealgazette.com/feed',
    language: 'en',
    region: 'Montreal',
  },
  {
    name: 'La Presse',
    url: 'https://www.lapresse.ca/actualites/rss',
    language: 'fr',
    region: 'Montreal',
  },
  {
    name: 'Journal de Montréal',
    url: 'https://www.journaldemontreal.com/rss.xml',
    language: 'fr',
    region: 'Montreal',
  },
]

export const CANADA_DEFAULT_SOURCES = [
  {
    name: 'CBC Top Stories',
    url: 'https://www.cbc.ca/cmlink/rss-topstories',
    language: 'en',
    region: 'Canada',
  },
  {
    name: 'Radio-Canada À la une',
    url: 'https://ici.radio-canada.ca/info/rss/info/a-la-une',
    language: 'fr',
    region: 'Canada',
  },
  {
    name: 'Journal de Québec',
    url: 'https://www.journaldequebec.com/rss.xml',
    language: 'fr',
    region: 'Canada',
  },
  {
    name: 'Global News',
    url: 'https://globalnews.ca/feed/',
    language: 'en',
    region: 'Canada',
  },
]

export const TECH_DEFAULT_SOURCES = [
  {
    name: 'The Verge',
    url: 'https://www.theverge.com/rss/index.xml',
    language: 'en',
    region: 'Tech',
  },
  {
    name: 'Ars Technica',
    url: 'https://feeds.arstechnica.com/arstechnica/index',
    language: 'en',
    region: 'Tech',
  },
  {
    name: 'TechCrunch',
    url: 'https://techcrunch.com/feed/',
    language: 'en',
    region: 'Tech',
  },
  {
    name: 'ZDNet France',
    url: 'https://www.zdnet.fr/feeds/rss/actualites/',
    language: 'fr',
    region: 'Tech',
  },
  {
    name: '01net',
    url: 'https://www.01net.com/rss/',
    language: 'fr',
    region: 'Tech',
  },
]

/** @typedef {'montreal' | 'canada' | 'tech'} DefaultTabKey */

function normalizeForKey(s) {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/**
 * @param {string} tabName
 * @returns {DefaultTabKey | null}
 */
export function classifyDefaultTab(tabName) {
  const n = normalizeForKey(tabName)
  if (n === 'montreal') return 'montreal'
  if (n === 'canada') return 'canada'
  if (n === 'tech') return 'tech'
  return null
}

/**
 * @param {DefaultTabKey} key
 * @returns {ReturnType<typeof sourceToWebCatalogShape>[]}
 */
export function sourcesForDefaultTab(key) {
  const raw =
    key === 'montreal'
      ? MONTREAL_DEFAULT_SOURCES
      : key === 'canada'
        ? CANADA_DEFAULT_SOURCES
        : TECH_DEFAULT_SOURCES
  return raw.map(sourceToWebCatalogShape)
}

/** Canonical display names when creating a missing built-in tab (restore from custom tab). */
export const DEFAULT_TAB_NAMES = {
  montreal: 'Montréal',
  canada: 'Canada',
  tech: 'Tech',
}

function normalizeFeedUrlForMatch(u) {
  return String(u ?? '')
    .trim()
    .toLowerCase()
    .replace(/\/+$/, '')
}

/**
 * True when the tab uses the same feed URLs as the defaults (order-independent).
 * @param {readonly { url?: string }[] | null | undefined} current
 * @param {readonly { url?: string }[] | null | undefined} defaults
 */
export function sourcesMatchDefaults(current, defaults) {
  const a = (current ?? [])
    .map((s) => normalizeFeedUrlForMatch(s.url))
    .filter(Boolean)
    .sort()
  const b = (defaults ?? [])
    .map((s) => normalizeFeedUrlForMatch(s.url))
    .filter(Boolean)
    .sort()
  if (a.length !== b.length) return false
  return a.every((url, i) => url === b[i])
}
