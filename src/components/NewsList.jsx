import { translations } from '../constants/translations'
import { NewsItem } from './NewsItem'

export const NewsList = ({ 
  news, 
  uiLanguage, 
  loading, 
  error, 
  newItemIds,
  combinedCategories,
  onCategoryClick,
  expandAllSignal = null,
}) => {
  const t = translations[uiLanguage]

  if (error) {
    return <div className="error">{t.error}: {error}</div>
  }

  if (loading && news.length === 0) {
    return <div className="loading">{t.newsListLoading}</div>
  }

  if (news.length === 0) {
    return <div className="no-news">{t.noNews}</div>
  }

  return (
    <div className="news-list">
      {news.map((item) => (
        <NewsItem
          key={item.id || `${item.link}-${item.title}`}
          item={item}
          uiLanguage={uiLanguage}
          isNew={newItemIds.has(item.id)}
          combinedCategories={combinedCategories}
          onCategoryClick={onCategoryClick}
          expandAllSignal={expandAllSignal}
        />
      ))}
    </div>
  )
}
