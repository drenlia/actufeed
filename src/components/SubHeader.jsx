import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { translations } from '../constants/translations'
import { CategoryDropdown } from './CategoryDropdown'
import { HighlyRatedToggle } from './HighlyRatedToggle'
import { RefreshIconButton } from './RefreshIconButton'
import { SortBySegmented } from './SortBySegmented'

const SHOW_FILTER_KEYS = ['all', 'fr', 'en']

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
    return null
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
        </div>
      </div>
    </div>
  )
}
