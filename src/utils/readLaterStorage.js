/**
 * Saved articles ("read later") — same storage key as the native app for parity.
 * Web stores metadata + remote thumbnail URL only (no local file copy).
 */
import { htmlToPlainOneLine, looksLikeRssMarkup } from './sanitizeHtml'

export const READ_LATER_STORAGE_KEY = 'actufeed-read-later-v1'

/** @typedef {'rss2' | 'atom'} SyndicationFormat */

/**
 * @typedef {object} SavedArticle
 * @property {string} id
 * @property {string} title
 * @property {string} link
 * @property {string} sourceName
 * @property {string} summary
 * @property {string} publishedAtIso
 * @property {string} savedAtIso
 * @property {string} [thumbnailUrl]
 * @property {string} [feedLogo]
 * @property {'fr' | 'en'} [sourceLanguage]
 * @property {SyndicationFormat} syndicationFormat
 */

function plainSummaryFromItem(item) {
  const raw = (item.description || '').trim()
  if (!raw) return ''
  if (looksLikeRssMarkup(raw)) {
    return htmlToPlainOneLine(raw).trim()
  }
  return raw.replace(/\s+/g, ' ').trim()
}

function normalizeSavedEntry(raw) {
  if (!raw || typeof raw !== 'object') return null
  const id = raw.id
  const title = typeof raw.title === 'string' ? raw.title : ''
  const link = typeof raw.link === 'string' ? raw.link : ''
  if (!id || !link) return null
  const sourceName =
    typeof raw.sourceName === 'string'
      ? raw.sourceName
      : typeof raw.source === 'string'
        ? raw.source
        : ''
  const syndicationFormat =
    raw.syndicationFormat === 'atom' || raw.syndicationFormat === 'rss2' ? raw.syndicationFormat : 'rss2'
  const publishedAtIso =
    typeof raw.publishedAtIso === 'string' && raw.publishedAtIso
      ? raw.publishedAtIso
      : new Date().toISOString()
  const savedAtIso =
    typeof raw.savedAtIso === 'string' && raw.savedAtIso ? raw.savedAtIso : new Date().toISOString()
  const summary = typeof raw.summary === 'string' ? raw.summary : ''
  const thumbnailUrl = typeof raw.thumbnailUrl === 'string' ? raw.thumbnailUrl : undefined
  const feedLogo = typeof raw.feedLogo === 'string' ? raw.feedLogo : undefined
  const sourceLanguage = raw.sourceLanguage === 'fr' || raw.sourceLanguage === 'en' ? raw.sourceLanguage : undefined
  return {
    id,
    title,
    link,
    sourceName,
    summary,
    publishedAtIso,
    savedAtIso,
    thumbnailUrl,
    feedLogo,
    sourceLanguage,
    syndicationFormat,
  }
}

export function loadReadLaterList() {
  try {
    const raw = localStorage.getItem(READ_LATER_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map(normalizeSavedEntry).filter(Boolean)
  } catch {
    return []
  }
}

function persistReadLaterList(list) {
  try {
    localStorage.setItem(READ_LATER_STORAGE_KEY, JSON.stringify(list))
    return true
  } catch (e) {
    console.warn('[readLater] Failed to persist:', e)
    return false
  }
}

/**
 * @param {Record<string, unknown>} item — RSS-shaped article from the feed
 * @returns {boolean} true if newly added
 */
export function addReadLaterFromNewsItem(item) {
  const list = loadReadLaterList()
  if (list.some((i) => i.id === item.id)) return false

  const publishedAt = item.publishedAt instanceof Date ? item.publishedAt : new Date(item.publishedAt)
  const publishedAtIso = Number.isNaN(publishedAt.getTime()) ? new Date().toISOString() : publishedAt.toISOString()

  const thumb = typeof item.thumbnail === 'string' ? item.thumbnail.trim() : ''
  const logo = typeof item.feedLogo === 'string' ? item.feedLogo.trim() : ''
  const thumbnailUrl = thumb || undefined
  const feedLogo = logo || undefined

  /** @type {SavedArticle} */
  const entry = {
    id: item.id,
    title: typeof item.title === 'string' ? item.title : '',
    link: typeof item.link === 'string' ? item.link : '',
    sourceName: typeof item.source === 'string' ? item.source : '',
    summary: plainSummaryFromItem(item),
    publishedAtIso,
    savedAtIso: new Date().toISOString(),
    thumbnailUrl,
    feedLogo,
    sourceLanguage: item.language === 'fr' || item.language === 'en' ? item.language : undefined,
    syndicationFormat: item.syndicationFormat === 'atom' ? 'atom' : 'rss2',
  }
  list.unshift(entry)
  persistReadLaterList(list)
  return true
}

export function removeReadLater(id) {
  const list = loadReadLaterList().filter((i) => i.id !== id)
  persistReadLaterList(list)
}

/**
 * @param {SavedArticle} s
 * @returns {Record<string, unknown>}
 */
export function savedArticleToNewsItem(s) {
  const publishedAt = new Date(s.publishedAtIso)
  const thumb = s.thumbnailUrl || ''
  return {
    id: s.id,
    title: s.title,
    link: s.link,
    pubDate: s.publishedAtIso,
    description: s.summary,
    descriptionFull: s.summary,
    guid: s.id,
    author: '',
    categories: [],
    content: '',
    thumbnail: thumb,
    feedLogo: s.feedLogo || '',
    feedLogoTier: '',
    source: s.sourceName,
    language: s.sourceLanguage || 'en',
    region: '',
    publishedAt: Number.isNaN(publishedAt.getTime()) ? new Date() : publishedAt,
    popularityScore: 0,
    shareCount: 0,
    syndicationFormat: s.syndicationFormat,
  }
}
