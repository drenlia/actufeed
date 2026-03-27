import { translations } from '../constants/translations'
import { CategoryDropdown } from './CategoryDropdown'
import { HighlyRatedToggle } from './HighlyRatedToggle'
import { RefreshIconButton } from './RefreshIconButton'

export const Filters = ({
  uiLanguage,
  newsFilter,
  onNewsFilterChange,
  selectedCategories,
  availableCategories,
  onToggleCategory,
  onClearCategories,
  onClearAllFilters,
  sortBy,
  onSortChange,
  showHighlyRated,
  onHighlyRatedToggle,
  searchQuery,
  onSearchChange,
  onRefresh,
  loading,
  autoRefresh,
  onAutoRefreshChange
}) => {
  const t = translations[uiLanguage]

  return (
    <div className="controls">
      <div className="control-group">
        <button 
          className={`filter-btn ${newsFilter === 'all' ? 'active' : ''}`}
          onClick={() => onNewsFilterChange('all')}
        >
          {t.filterAll}
        </button>
        <button 
          className={`filter-btn ${newsFilter === 'fr' ? 'active' : ''}`}
          onClick={() => onNewsFilterChange('fr')}
        >
          {t.filterFrench}
        </button>
        <button 
          className={`filter-btn ${newsFilter === 'en' ? 'active' : ''}`}
          onClick={() => onNewsFilterChange('en')}
        >
          {t.filterEnglish}
        </button>
      </div>
      
      <CategoryDropdown
        uiLanguage={uiLanguage}
        selectedCategories={selectedCategories}
        availableCategories={availableCategories}
        onToggleCategory={onToggleCategory}
        onClearCategories={onClearCategories}
      />
      
      <div className="control-group">
        <label>{t.sortBy}:</label>
        <button 
          className={`filter-btn ${sortBy === 'date' ? 'active' : ''}`}
          onClick={() => onSortChange('date')}
        >
          {t.sortDate}
        </button>
        <button 
          className={`filter-btn ${sortBy === 'popularity' ? 'active' : ''}`}
          onClick={() => onSortChange('popularity')}
        >
          {t.sortPopularity}
        </button>
      </div>
      
      <div className="control-group">
        <HighlyRatedToggle active={showHighlyRated} onToggle={onHighlyRatedToggle} label={t.highlyRated} />
      </div>
      
      <div className="control-group search-group">
        <label htmlFor="news-search">{t.searchArticles}:</label>
        <input
          id="news-search"
          type="text"
          className="search-input"
          placeholder={t.searchPlaceholder}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        {searchQuery && (
          <button
            className="clear-search-btn"
            onClick={() => onSearchChange('')}
            title="Clear search"
          >
            ✕
          </button>
        )}
      </div>
      
      <div className="control-group">
        <RefreshIconButton onClick={onRefresh} disabled={loading} loading={loading} label={t.refresh} />
        <button 
          onClick={onClearAllFilters}
          className="clear-filters-btn"
          title={t.clearFilters}
        >
          {t.clearFilters}
        </button>
        <label className="checkbox-label">
          <input 
            type="checkbox" 
            checked={autoRefresh}
            onChange={(e) => onAutoRefreshChange(e.target.checked)}
          />
          {t.autoRefresh}
        </label>
      </div>
    </div>
  )
}
