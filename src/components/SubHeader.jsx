import { translations } from '../constants/translations'
import { CategoryDropdown } from './CategoryDropdown'

export const SubHeader = ({
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
  onAutoRefreshChange,
  collapsed,
}) => {
  const t = translations[uiLanguage]

  const clearSearch = () => {
    onSearchChange('')
  }

  if (collapsed) {
    return null
  }

  return (
    <div className="sub-header">
      <div className="controls-container">
        {/* Group 1: Language Filters */}
        <div className="control-group-section">
          <span className="control-section-label">{t.view || 'View'}</span>
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

        {/* Group 2: Category, Sort, Highly Rated */}
        <div className="control-group-section">
          <span className="control-section-label">{t.filter || 'Filter'}</span>
          <CategoryDropdown
            uiLanguage={uiLanguage}
            selectedCategories={selectedCategories}
            availableCategories={availableCategories}
            onToggleCategory={onToggleCategory}
            onClearCategories={onClearCategories}
          />
          <select 
            className="sort-select"
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value)}
          >
            <option value="date">{t.sortDate}</option>
            <option value="popularity">{t.sortPopularity}</option>
          </select>
          <label className="checkbox-label-compact">
            <input
              type="checkbox"
              checked={showHighlyRated}
              onChange={onHighlyRatedToggle}
            />
            {t.highlyRated}
          </label>
        </div>

        {/* Group 3: Refresh & Auto-refresh */}
        <div className="control-group-section">
          <span className="control-section-label">{t.refresh || 'Refresh'}</span>
          <button
            className="refresh-btn-compact"
            onClick={onRefresh}
            disabled={loading}
            title={t.refresh}
          >
            {loading ? '⏳' : '🔄'} {t.refresh}
          </button>
          <label className="checkbox-label-compact">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => onAutoRefreshChange(e.target.checked)}
            />
            {t.autoRefresh}
          </label>
        </div>

        {/* Group 4: Search & Clear All */}
        <div className="control-group-section">
          <span className="control-section-label">{t.searchArticles || 'Search'}</span>
          <div className="search-input-wrapper">
            <input
              type="text"
              className="search-input-compact"
              placeholder={t.searchPlaceholder}
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
            />
            {searchQuery && (
              <button
                className="clear-search-btn"
                onClick={clearSearch}
                title="Clear search"
              >
                ×
              </button>
            )}
          </div>
          <button
            className="clear-filters-btn-compact"
            onClick={onClearAllFilters}
          >
            {t.clearFilters}
          </button>
        </div>
      </div>
    </div>
  )
}
