/**
 * Matches NewsItem logic: card shows more…/less… only when this is true.
 * @param {object} item - parsed news article
 * @returns {boolean}
 */
export function itemNeedsDescriptionExpand(item) {
  if (!item) return false
  const fullText = (item.descriptionFull || item.content || item.description || '').trim()
  const previewText = (item.description || '').trim()
  const previewComparable = previewText.replace(/\.{2,}\s*$/, '').trim()
  const hasDescriptionSection = Boolean(
    previewText ||
      (item.descriptionFull && item.descriptionFull.trim()) ||
      (item.content && item.content.trim())
  )
  if (!hasDescriptionSection || !fullText) return false
  return fullText.length > previewComparable.length + 8
}

export function countExpandableDescriptionItems(news) {
  if (!Array.isArray(news)) return 0
  return news.reduce((n, item) => n + (itemNeedsDescriptionExpand(item) ? 1 : 0), 0)
}
