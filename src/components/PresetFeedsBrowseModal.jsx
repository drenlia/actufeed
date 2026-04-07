import { useEffect, useRef } from 'react'

/**
 * Full-screen style modal: country filters, search, preset catalog list with
 * checkboxes and quick add/remove — mirrors the former sidebar + available-sources column.
 */
export function PresetFeedsBrowseModal({
  open,
  onClose,
  t,
  availableCountries,
  countrySearchQuery,
  onCountrySearchChange,
  selectedCountries,
  onToggleCountry,
  onClearCountryFilters,
  searchQuery,
  onSearchQueryChange,
  searchResults,
  selectedAvailableSources,
  onToggleAvailableSelection,
  onToggleSelectAllAvailable,
  allAvailableSelected,
  onAddSelected,
  activeSourceUrls,
  onToggleSource,
}) {
  const closeBtnRef = useRef(null)
  /** Stable close handler — parent often passes inline lambdas; including them in deps re-ran this effect every render and stole focus from search inputs. */
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', onKey)
    const id = requestAnimationFrame(() => closeBtnRef.current?.focus())
    return () => {
      document.removeEventListener('keydown', onKey)
      cancelAnimationFrame(id)
    }
  }, [open])

  if (!open) return null

  return (
    <div
      className="preset-browse-overlay"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="preset-browse-dialog settings-glass-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="preset-browse-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="preset-browse-header">
          <h2 id="preset-browse-title" className="preset-browse-title">
            {t.presetBrowseModalTitle}
          </h2>
          <button
            ref={closeBtnRef}
            type="button"
            className="preset-browse-done-btn"
            onClick={onClose}
          >
            {t.presetBrowseDone}
          </button>
        </div>

        <div className="preset-browse-body">
          <aside className="preset-browse-sidebar">
            <h3 className="preset-browse-sidebar-heading">
              <span className="settings-country-heading__full">{t.filterByCountry}</span>
              <span className="settings-country-heading__short">{t.filterByCountryShort}</span>
            </h3>
            <div className="country-search-container">
              <input
                type="text"
                className="country-search-input"
                placeholder={t.searchCountriesPlaceholder}
                value={countrySearchQuery}
                onChange={(e) => onCountrySearchChange(e.target.value)}
              />
              {countrySearchQuery ? (
                <button
                  type="button"
                  className="country-search-clear"
                  onClick={() => onCountrySearchChange('')}
                  title={t.countrySearchClear}
                >
                  ×
                </button>
              ) : null}
            </div>
            <div className="country-pills-vertical preset-browse-country-pills">
              {availableCountries
                .filter((country) => {
                  if (!countrySearchQuery.trim()) return true
                  const q = countrySearchQuery.toLowerCase()
                  return (
                    country.name.toLowerCase().includes(q) ||
                    country.code.toLowerCase().includes(q)
                  )
                })
                .map((country) => {
                  const isSelected = selectedCountries.has(country.code)
                  return (
                    <button
                      key={country.code}
                      type="button"
                      className={`country-pill-vertical ${isSelected ? 'selected' : ''}`}
                      onClick={() => onToggleCountry(country.code)}
                      title={`${country.name} (${country.count} sources)`}
                    >
                      <span className="country-code">{country.code.toUpperCase()}</span>
                      <span className="country-name">{country.name}</span>
                      <span className="country-count">({country.count})</span>
                    </button>
                  )
                })}
            </div>
            {selectedCountries.size > 0 ? (
              <button type="button" className="clear-country-filters-btn clear-country-filters-btn--after-pills" onClick={onClearCountryFilters}>
                {t.clearFilters}
              </button>
            ) : null}
          </aside>

          <div className="preset-browse-main">
            <div className="settings-section settings-search-section preset-browse-search">
              <h3 className="preset-browse-search-heading">{t.searchSources}</h3>
              <div className="source-search-container">
                <input
                  type="text"
                  className="source-search-input"
                  placeholder={t.searchSourcesPlaceholder}
                  value={searchQuery}
                  onChange={(e) => onSearchQueryChange(e.target.value)}
                />
                {searchResults.length > 0 ? (
                  <div className="search-results-header">
                    <span>
                      {t.showingResults} {searchResults.length} {t.results}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="preset-browse-sources-wrap">
              <div className="column-header preset-browse-list-header">
                <h3>
                  <span className="settings-sources-col-heading__full">{t.availableSources}</span>
                  <span className="settings-sources-col-heading__short">{t.availableSourcesShort}</span>
                </h3>
                <div className="header-buttons">
                  {searchResults.length > 0 ? (
                    <button type="button" className="select-all-btn" onClick={onToggleSelectAllAvailable}>
                      {allAvailableSelected ? t.deselectAll : t.selectAll}
                    </button>
                  ) : null}
                  {selectedAvailableSources.size > 0 ? (
                    <button type="button" className="add-selected-btn" onClick={onAddSelected}>
                      {t.addSelected} ({selectedAvailableSources.size})
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="sources-list-container preset-browse-sources-scroll">
                {searchResults.length === 0 ? (
                  <div className="no-results">{t.noResults}</div>
                ) : (
                  <div className="sources-list-compact">
                    {searchResults.map((source, idx) => {
                      const isActive = activeSourceUrls.has(source.url)
                      const isSelected = selectedAvailableSources.has(source.url)
                      return (
                        <div
                          key={`${idx}-${source.url || 'source'}`}
                          className={`source-item-compact ${isActive ? 'active' : ''} ${isSelected ? 'selected' : ''}`}
                        >
                          <label className="source-checkbox-label-compact">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => onToggleAvailableSelection(source.url)}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <div className="source-info-compact">
                              <div className="source-name-row">
                                <span className="source-name">{source.name}</span>
                                {isActive ? <span className="active-badge">✓</span> : null}
                              </div>
                              <div className="source-meta-compact">
                                {source.region ? <span className="source-region">{source.region}</span> : null}
                                <span className="source-language">{source.language}</span>
                                <span className="source-type">{source.type}</span>
                              </div>
                            </div>
                          </label>
                          <button
                            type="button"
                            className={`toggle-source-btn-compact ${isActive ? 'remove' : 'add'}`}
                            onClick={() => onToggleSource(source)}
                            title={isActive ? t.disableSource : t.enableSource}
                          >
                            {isActive ? '−' : '+'}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
