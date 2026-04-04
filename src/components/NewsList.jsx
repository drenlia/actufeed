import { translations } from '../constants/translations'
import { NewsItem } from './NewsItem'

export const NewsList = ({
  news,
  uiLanguage,
  loading,
  error,
  /** Feed tab: fetch failed and there is no usable local cache (distinct from “no articles”). */
  feedUnavailableEmpty = false,
  newItemIds,
  combinedCategories,
  onCategoryClick,
  /** (kind, value) => void — language|source|category|minPopularity */
  onArticleMetaFilter = null,
  /** Current filter lens for highlighting / clear affordances on article meta. */
  articleFilterActive = null,
  expandAllSignal = null,
  /** 'list' | 'columns2' | 'columns3' */
  feedLayout = 'list',
  descriptionFontScale = 1,
  /** 'feed' = save/unsave on image; 'saved' = remove from saved */
  readLaterVariant = null,
  savedArticleIds = null,
  onToggleSavedArticle = null,
  onRemoveSavedArticle = null,
}) => {
  const t = translations[uiLanguage]

  if (error) {
    return <div className="error">{t.error}: {error}</div>
  }

  if (loading && news.length === 0) {
    return <div className="loading">{t.newsListLoading}</div>
  }

  if (news.length === 0) {
    if (readLaterVariant === 'saved') {
      return (
        <div className="news-saved-empty">
          <span className="news-saved-empty__icon" aria-hidden>
            🔖
          </span>
          <p className="news-saved-empty__title">{t.savedArticlesEmptyTitle}</p>
          <p className="news-saved-empty__hint">{t.savedArticlesEmptyHint}</p>
        </div>
      )
    }
    if (feedUnavailableEmpty) {
      return (
        <div className="feed-unavailable-empty" role="status">
          <p className="feed-unavailable-empty__title">{t.feedUnavailableEmptyTitle}</p>
          <p className="feed-unavailable-empty__hint">{t.feedUnavailableEmptyHint}</p>
        </div>
      )
    }
    return <div className="no-news">{t.noNews}</div>
  }

  const layoutClass =
    feedLayout === 'columns2' || feedLayout === 'columns3' ? feedLayout : 'list'

  return (
    <div
      className={`news-list news-list--layout-${layoutClass}`}
      style={{ '--news-desc-scale': String(descriptionFontScale) }}
    >
      {news.map((item) => (
        <NewsItem
          key={item.id || `${item.link}-${item.title}`}
          item={item}
          uiLanguage={uiLanguage}
          isNew={newItemIds.has(item.id)}
          combinedCategories={combinedCategories}
          onCategoryClick={onCategoryClick}
          onArticleMetaFilter={onArticleMetaFilter}
          articleFilterActive={articleFilterActive}
          expandAllSignal={expandAllSignal}
          readLaterVariant={readLaterVariant}
          readLaterSaved={
            readLaterVariant === 'feed' ? Boolean(savedArticleIds?.has(item.id)) : false
          }
          onToggleSavedArticle={onToggleSavedArticle}
          onRemoveSavedArticle={onRemoveSavedArticle}
        />
      ))}
    </div>
  )
}
