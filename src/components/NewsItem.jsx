import { useState, useMemo, useEffect } from 'react'
import { formatDate } from '../utils/dateUtils'
import {
  sanitizeRssHtml,
  plainTextToArticleHtml,
  looksLikeRssMarkup,
  htmlToPlainOneLine,
} from '../utils/sanitizeHtml'
import { translations } from '../constants/translations'
import { itemNeedsDescriptionExpand } from '../utils/newsDescriptionExpand'

const DESCRIPTION_STRIP_REGEX = [
  /<img[^>]*>/gi,
  /<figure[^>]*>.*?<\/figure>/gi,
  /<picture[^>]*>.*?<\/picture>/gi,
  /<div[^>]*class="[^"]*image[^"]*"[^>]*>.*?<\/div>/gi,
  /<div[^>]*style="[^"]*background-image[^"]*"[^>]*>.*?<\/div>/gi,
  /<iframe[^>]*>.*?<\/iframe>/gi,
  /<embed[^>]*>.*?<\/embed>/gi,
  /<object[^>]*>.*?<\/object>/gi,
  /<video[^>]*>.*?<\/video>/gi,
  /<audio[^>]*>.*?<\/audio>/gi,
  /<core-commerce[^>]*>.*?<\/core-commerce>/gi,
]

const sanitizeDescriptionHtml = (raw) => {
  let html = raw
  for (const re of DESCRIPTION_STRIP_REGEX) {
    html = html.replace(re, '')
  }
  return sanitizeRssHtml(html)
}

export const NewsItem = ({
  item,
  uiLanguage,
  isNew,
  combinedCategories,
  onCategoryClick,
  expandAllSignal = null,
}) => {
  const t = translations[uiLanguage]
  const formatDateLocalized = (date) => formatDate(date, uiLanguage)
  const [expanded, setExpanded] = useState(false)
  const [imageHidden, setImageHidden] = useState(false)

  const needsExpandToggle = useMemo(() => itemNeedsDescriptionExpand(item), [item])

  useEffect(() => {
    if (!expandAllSignal || expandAllSignal.nonce === 0) return
    if (!needsExpandToggle) return
    setExpanded(expandAllSignal.expanded)
  }, [expandAllSignal, needsExpandToggle])

  const imageUrl = !imageHidden && (item.thumbnail || item.feedLogo)
  const isFeedLogoOnly = !item.thumbnail && !!item.feedLogo
  const isFaviconLogo =
    isFeedLogoOnly &&
    (item.feedLogoTier === 'favicon' || /\.ico(\?|$)/i.test(item.feedLogo || ''))

  const fullText = useMemo(
    () => (item.descriptionFull || item.content || item.description || '').trim(),
    [item.descriptionFull, item.content, item.description]
  )

  const sanitizedFull = useMemo(() => {
    if (!fullText) return ''
    if (looksLikeRssMarkup(fullText)) {
      return sanitizeDescriptionHtml(fullText)
    }
    return sanitizeDescriptionHtml(plainTextToArticleHtml(fullText))
  }, [fullText])

  const previewText = (item.description || '').trim()
  const previewComparable = previewText.replace(/\.{2,}\s*$/, '').trim()

  const hasDescriptionSection = Boolean(
    previewText || (item.descriptionFull && item.descriptionFull.trim()) || (item.content && item.content.trim())
  )

  /** Collapsed cards must use the short RSS teaser only — full HTML breaks -webkit-line-clamp (many <p> blocks). */
  const sanitizedCollapsedPreview = useMemo(() => {
    let raw = (item.description || '').trim()
    if (!raw) return ''
    if (looksLikeRssMarkup(raw)) {
      raw = htmlToPlainOneLine(raw)
    } else {
      raw = raw.replace(/\s+/g, ' ')
    }
    return sanitizeDescriptionHtml(raw)
  }, [item.description])

  return (
    <article
      key={item.id || `${item.link}-${item.title}`}
      className={`news-item ${isNew ? 'new-item' : ''}`}
    >
      <div className="news-content-wrapper">
        {imageUrl && (
          <div className="news-image-container">
            <a href={item.link} target="_blank" rel="noopener noreferrer" className="news-image-link">
              <img
                src={imageUrl}
                alt={item.title || item.source || 'Article'}
                className={`news-image ${isFaviconLogo ? 'news-image--favicon' : ''} ${isFeedLogoOnly && !isFaviconLogo ? 'news-image--logo' : ''}`}
                onError={() => setImageHidden(true)}
              />
            </a>
          </div>
        )}
        <div className="news-text-content">
          <div className="news-header">
            {item.title && item.title.trim() !== '' ? (
              <h2 className="news-title">
                <a href={item.link} target="_blank" rel="noopener noreferrer">
                  {item.title}
                </a>
              </h2>
            ) : null}
            <div className="news-meta">
              <span className={`lang-badge ${item.language}`}>{item.language.toUpperCase()}</span>
              <span className="news-source">{item.source}</span>
              <span className="news-date">{formatDateLocalized(item.publishedAt)}</span>
              {(item.popularityScore > 0 || (item.categories && item.categories.length > 0)) && (
                <div className="news-meta-rating-cats">
                  {item.popularityScore > 0 && (
                    <span className="popularity-badge" title="Popularity Score">
                      {item.popularityScore}
                    </span>
                  )}
                  {item.categories &&
                    item.categories.map((cat, idx) => {
                      const combinedCat = combinedCategories.find((c) =>
                        c.variants.some((v) => v.toLowerCase() === cat.toLowerCase())
                      )
                      const displayName = combinedCat ? combinedCat.displayName : cat
                      return (
                        <span
                          key={idx}
                          className="category-badge"
                          onClick={() => onCategoryClick(displayName)}
                          title="Filter by category"
                        >
                          {cat}
                        </span>
                      )
                    })}
                </div>
              )}
            </div>
          </div>
          {hasDescriptionSection && (
            <>
              {item.title && item.title.trim() !== '' ? (
                needsExpandToggle ? (
                  <div className={`news-body-expandable ${expanded ? 'is-expanded' : 'is-collapsed'}`}>
                    {!expanded ? (
                      <div className="news-description-clamp-block">
                        <div
                          className="news-description-inner"
                          dangerouslySetInnerHTML={{ __html: sanitizedCollapsedPreview }}
                        />
                        <button
                          type="button"
                          className="news-more-suffix"
                          onClick={() => setExpanded(true)}
                          aria-expanded={false}
                        >
                          {t.readMore}
                        </button>
                      </div>
                    ) : (
                      <div className="news-description-expanded-flow">
                        <div
                          className="news-description-inner"
                          dangerouslySetInnerHTML={{ __html: sanitizedFull }}
                        />
                        <button
                          type="button"
                          className="news-more-toggle news-more-toggle--after-expanded"
                          onClick={() => setExpanded(false)}
                          aria-expanded
                        >
                          {t.readLess}
                        </button>
                      </div>
                    )}
                  </div>
                ) : (
                  <p
                    className="news-description"
                    dangerouslySetInnerHTML={{ __html: sanitizeDescriptionHtml(item.description) }}
                  />
                )
              ) : needsExpandToggle ? (
                <div className="news-no-title-expandable">
                  <div className={`news-body-expandable ${expanded ? 'is-expanded' : 'is-collapsed'}`}>
                    {!expanded ? (
                      <div className="news-description-clamp-block">
                        <div
                          className="news-description-inner"
                          dangerouslySetInnerHTML={{ __html: sanitizedCollapsedPreview }}
                        />
                        <button
                          type="button"
                          className="news-more-suffix"
                          onClick={() => setExpanded(true)}
                          aria-expanded={false}
                        >
                          {t.readMore}
                        </button>
                      </div>
                    ) : (
                      <div className="news-description-expanded-flow">
                        <div
                          className="news-description-inner"
                          dangerouslySetInnerHTML={{ __html: sanitizedFull }}
                        />
                        <button
                          type="button"
                          className="news-more-toggle news-more-toggle--after-expanded"
                          onClick={() => setExpanded(false)}
                          aria-expanded
                        >
                          {t.readLess}
                        </button>
                      </div>
                    )}
                  </div>
                  <a
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="news-open-article-link"
                  >
                    {t.openArticle} →
                  </a>
                </div>
              ) : (
                <a
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="news-description news-description-link"
                  dangerouslySetInnerHTML={{
                    __html: sanitizeDescriptionHtml(item.description),
                  }}
                />
              )}
            </>
          )}
        </div>
      </div>
    </article>
  )
}
