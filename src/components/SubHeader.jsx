import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { translations } from '../constants/translations'
import { CategoryDropdown } from './CategoryDropdown'
import { HighlyRatedToggle } from './HighlyRatedToggle'
import { RefreshIconButton } from './RefreshIconButton'
import { SortBySegmented } from './SortBySegmented'

const SHOW_FILTER_KEYS = ['all', 'fr', 'en']

const MAX_SEARCH_CHIP_LEN = 36

function categoryLabelForNormalized(normalized, availableCategories) {
  const g = availableCategories.find((c) => c.normalized === normalized)
  return g?.displayName || normalized
}

function SubHeaderCollapsedActiveBar({
  t,
  newsFilter,
  onNewsFilterChange,
  selectedCategories,
  availableCategories,
  onToggleCategory,
  sortBy,
  onSortChange,
  showHighlyRated,
  onHighlyRatedToggle,
  searchQuery,
  onSearchChange,
  sourceNameFilter,
  minPopularityScore,
  onClearSourceFilter,
  onClearMinRankFilter,
  onRequestExpandFilters,
}) {
  const searchTrim = searchQuery.trim()
  const searchChipText =
    searchTrim.length > MAX_SEARCH_CHIP_LEN
      ? `${searchTrim.slice(0, MAX_SEARCH_CHIP_LEN)}…`
      : searchTrim

  const sortedCategoryKeys = useMemo(
    () => Array.from(selectedCategories).sort((a, b) => a.localeCompare(b)),
    [selectedCategories]
  )

  return (
    <div className="sub-header sub-header--collapsed-active" role="region" aria-label={t.filterCollapsedSummaryAria}>
      <div className="sub-header__toolbar sub-header__toolbar--collapsed-active">
        <div className="sub-header__collapsed-active-scroll">
          {newsFilter === 'fr' ? (
            <button
              type="button"
              className="filter-quick-chip"
              onClick={() => onNewsFilterChange('all')}
              title={t.filterFromArticleLangClearTitle}
            >
              {t.filterSegmentFrench} ×
            </button>
          ) : null}
          {newsFilter === 'en' ? (
            <button
              type="button"
              className="filter-quick-chip"
              onClick={() => onNewsFilterChange('all')}
              title={t.filterFromArticleLangClearTitle}
            >
              {t.filterSegmentEnglish} ×
            </button>
          ) : null}
          {sortBy === 'popularity' ? (
            <button
              type="button"
              className="filter-quick-chip"
              onClick={() => onSortChange('date')}
              title={t.clearFilters}
            >
              {t.sortPopularity} ×
            </button>
          ) : null}
          {showHighlyRated ? (
            <button
              type="button"
              className="filter-quick-chip"
              onClick={onHighlyRatedToggle}
              title={t.clearFilters}
            >
              {t.highlyRated} ×
            </button>
          ) : null}
          {searchTrim ? (
            <button
              type="button"
              className="filter-quick-chip"
              onClick={() => onSearchChange('')}
              title={t.clearFilters}
            >
              {t.filterChipSearch.replace('{q}', searchChipText)} ×
            </button>
          ) : null}
          {sortedCategoryKeys.map((key) => {
            const label = categoryLabelForNormalized(key, availableCategories)
            return (
              <button
                key={key}
                type="button"
                className="filter-quick-chip"
                onClick={() => onToggleCategory(key)}
                title={t.filterFromArticleCategoryClearTitle}
                aria-label={t.filterFromArticleCategoryClearA11y.replace('{cat}', label)}
              >
                {label} ×
              </button>
            )
          })}
          {sourceNameFilter?.trim() ? (
            <button
              type="button"
              className="filter-quick-chip"
              onClick={onClearSourceFilter}
              title={t.clearFilters}
            >
              {t.filterChipSource.replace('{name}', sourceNameFilter.trim())} ×
            </button>
          ) : null}
          {minPopularityScore != null ? (
            <button
              type="button"
              className="filter-quick-chip"
              onClick={onClearMinRankFilter}
              title={t.clearFilters}
            >
              {t.filterChipMinRank.replace('{n}', String(minPopularityScore))} ×
            </button>
          ) : null}
        </div>
        <button
          type="button"
          className="sub-header__collapsed-active-expand"
          onClick={onRequestExpandFilters}
          title={t.showFilters}
          aria-label={t.showFilters}
        >
          <svg className="sub-header__collapsed-active-expand-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
          </svg>
          <span className="sub-header__collapsed-active-expand-text">{t.showFilters}</span>
        </button>
      </div>
    </div>
  )
}

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
  sourceNameFilter = '',
  minPopularityScore = null,
  onClearSourceFilter,
  onClearMinRankFilter,
  onRefresh,
  loading,
  autoRefresh,
  onAutoRefreshChange,
  collapsed,
  feedView = 'feed',
  hasActiveArticleFilters = false,
  onRequestExpandFilters,
}) => {
  const t = translations[uiLanguage]
  const segmentedRef = useRef(null)
  const btnRefs = useRef([])
  const [thumb, setThumb] = useState({ x: 0, y: 0, w: 0, h: 0 })

  const activeShowIndex = Math.max(0, SHOW_FILTER_KEYS.indexOf(newsFilter))

  const updateSegmentThumb = useCallback(() => {
    const container = segmentedRef.current
    const btn = btnRefs.current[activeShowIndex]
    if (!container || !btn) return
    const cr = container.getBoundingClientRect()
    const br = btn.getBoundingClientRect()
    setThumb({
      x: br.left - cr.left,
      y: br.top - cr.top,
      w: br.width,
      h: br.height,
    })
  }, [activeShowIndex])

  useLayoutEffect(() => {
    updateSegmentThumb()
  }, [updateSegmentThumb, uiLanguage])

  useLayoutEffect(() => {
    const el = segmentedRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => updateSegmentThumb())
    ro.observe(el)
    return () => ro.disconnect()
  }, [updateSegmentThumb])

  const clearSearch = () => {
    onSearchChange('')
  }

  if (collapsed) {
    if (feedView !== 'feed' || !hasActiveArticleFilters || !onRequestExpandFilters) {
      return null
    }
    return (
      <SubHeaderCollapsedActiveBar
        t={t}
        newsFilter={newsFilter}
        onNewsFilterChange={onNewsFilterChange}
        selectedCategories={selectedCategories}
        availableCategories={availableCategories}
        onToggleCategory={onToggleCategory}
        sortBy={sortBy}
        onSortChange={onSortChange}
        showHighlyRated={showHighlyRated}
        onHighlyRatedToggle={onHighlyRatedToggle}
        searchQuery={searchQuery}
        onSearchChange={onSearchChange}
        sourceNameFilter={sourceNameFilter}
        minPopularityScore={minPopularityScore}
        onClearSourceFilter={onClearSourceFilter}
        onClearMinRankFilter={onClearMinRankFilter}
        onRequestExpandFilters={onRequestExpandFilters}
      />
    )
  }

  return (
    <div className="sub-header">
      <div className="sub-header__toolbar controls-container">
        <div className="sub-header__chunk">
          <div className="sub-header__chunk-controls">
            <div
              ref={segmentedRef}
              className="filter-segmented"
              role="radiogroup"
              aria-label={t.subheaderShowAria}
            >
              <span
                className="filter-segmented__thumb"
                aria-hidden
                style={{
                  transform: `translate3d(${thumb.x}px, ${thumb.y}px, 0)`,
                  width: thumb.w ? `${thumb.w}px` : 0,
                  height: thumb.h ? `${thumb.h}px` : 0,
                  opacity: thumb.w ? 1 : 0,
                }}
              />
              <button
                ref={(el) => {
                  btnRefs.current[0] = el
                }}
                type="button"
                role="radio"
                aria-checked={newsFilter === 'all'}
                className={`filter-segmented__btn${newsFilter === 'all' ? ' is-active' : ''}`}
                onClick={() => onNewsFilterChange('all')}
              >
                {t.filterSegmentAll}
              </button>
              <button
                ref={(el) => {
                  btnRefs.current[1] = el
                }}
                type="button"
                role="radio"
                aria-checked={newsFilter === 'fr'}
                className={`filter-segmented__btn${newsFilter === 'fr' ? ' is-active' : ''}`}
                onClick={() => onNewsFilterChange('fr')}
              >
                {t.filterSegmentFrench}
              </button>
              <button
                ref={(el) => {
                  btnRefs.current[2] = el
                }}
                type="button"
                role="radio"
                aria-checked={newsFilter === 'en'}
                className={`filter-segmented__btn${newsFilter === 'en' ? ' is-active' : ''}`}
                onClick={() => onNewsFilterChange('en')}
              >
                {t.filterSegmentEnglish}
              </button>
            </div>
            <CategoryDropdown
              uiLanguage={uiLanguage}
              selectedCategories={selectedCategories}
              availableCategories={availableCategories}
              onToggleCategory={onToggleCategory}
              onClearCategories={onClearCategories}
            />
            <SortBySegmented sortBy={sortBy} onSortChange={onSortChange} uiLanguage={uiLanguage} />
            <HighlyRatedToggle active={showHighlyRated} onToggle={onHighlyRatedToggle} label={t.highlyRated} />
            <RefreshIconButton
              onClick={onRefresh}
              disabled={loading}
              loading={loading}
              label={t.refresh || 'Refresh'}
            />
            <label className="checkbox-label-compact">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => onAutoRefreshChange(e.target.checked)}
              />
              {t.autoRefresh}
            </label>
          </div>
        </div>

        <span className="sub-header__divider" aria-hidden="true" />

        <div className="sub-header__chunk sub-header__chunk--grow">
          <div className="sub-header__chunk-controls">
            <div className="search-input-wrapper">
              <input
                type="search"
                className="search-input-compact"
                placeholder={t.searchPlaceholder}
                aria-label={t.searchArticles}
                autoComplete="off"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  className="clear-search-btn"
                  onClick={clearSearch}
                  title="Clear search"
                >
                  ×
                </button>
              )}
            </div>
            <button type="button" className="clear-filters-btn-compact" onClick={onClearAllFilters}>
              {t.clearFilters}
            </button>
          </div>
          {(sourceNameFilter?.trim() || minPopularityScore != null) && (
            <div className="sub-header__quick-filter-chips">
              {sourceNameFilter?.trim() ? (
                <button
                  type="button"
                  className="filter-quick-chip"
                  onClick={onClearSourceFilter}
                  title={t.clearFilters}
                >
                  {t.filterChipSource.replace('{name}', sourceNameFilter.trim())} ×
                </button>
              ) : null}
              {minPopularityScore != null ? (
                <button
                  type="button"
                  className="filter-quick-chip"
                  onClick={onClearMinRankFilter}
                  title={t.clearFilters}
                >
                  {t.filterChipMinRank.replace('{n}', String(minPopularityScore))} ×
                </button>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
