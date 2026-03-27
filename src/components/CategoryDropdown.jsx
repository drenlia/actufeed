import { useState, useEffect, useRef, useId } from 'react'
import { translations } from '../constants/translations'

export const CategoryDropdown = ({
  uiLanguage,
  selectedCategories,
  availableCategories,
  onToggleCategory,
  onClearCategories
}) => {
  const handleToggle = (categoryName) => {
    if (categoryName === null) {
      // Always clear when clicking "All Categories"
      onClearCategories()
    } else {
      // When toggling a specific category, if "All Categories" is currently selected (size === 0),
      // we need to clear it first, then add the new category
      if (selectedCategories.size === 0) {
        // This shouldn't happen, but handle it just in case
        onToggleCategory(categoryName)
      } else {
        onToggleCategory(categoryName)
      }
    }
  }
  
  const handleAllCategoriesClick = () => {
    // Always clear all categories when clicking "All Categories"
    onClearCategories()
  }
  const t = translations[uiLanguage]
  const rootRef = useRef(null)
  const menuId = useId()
  const searchInputId = useId()
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  const summaryLabel =
    selectedCategories.size === 0
      ? t.allCategories
      : selectedCategories.size === 1
        ? t.categoriesSelectedOne
        : t.categoriesSelectedOther.replace('{n}', String(selectedCategories.size))

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setIsOpen(false)
        setSearchQuery('')
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // Filter categories based on search query
  const filteredCategories = availableCategories.filter(catGroup => {
    if (!searchQuery.trim()) return true
    const query = searchQuery.toLowerCase()
    return catGroup.displayName.toLowerCase().includes(query) ||
           catGroup.variants.some(variant => variant.toLowerCase().includes(query))
  })


  return (
    <div className="category-filter-group" ref={rootRef}>
      <div className="category-dropdown">
        <button
          type="button"
          className="category-dropdown-toggle"
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
          aria-haspopup="true"
          aria-controls={menuId}
          aria-label={`${t.filterByCategory}: ${summaryLabel}`}
        >
          <span className="category-dropdown-toggle__value">{summaryLabel}</span>
          <svg
            className={`category-dropdown-toggle__chevron${isOpen ? ' is-open' : ''}`}
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M6 9l6 6 6-6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <div
          id={menuId}
          className={`category-dropdown-content ${isOpen ? 'show' : ''}`}
          role="region"
          aria-label={t.filterByCategory}
        >
          <div className="category-search-wrapper">
            <div className="category-search-row">
              <input
                id={searchInputId}
                type="search"
                className="category-search-input"
                placeholder={t.searchCategories || 'Search categories...'}
                aria-label={t.searchCategories}
                autoComplete="off"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  e.stopPropagation()
                  if (e.key === 'Escape') {
                    setIsOpen(false)
                    setSearchQuery('')
                  }
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  className="category-search-clear"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    setSearchQuery('')
                  }}
                  title={t.categorySearchClear}
                >
                  ×
                </button>
              )}
            </div>
          </div>
          <div className="category-dropdown-items-container">
            <div className="category-dropdown-item">
              <label>
                <input
                  type="checkbox"
                  checked={selectedCategories.size === 0}
                  onChange={handleAllCategoriesClick}
                  onClick={(e) => {
                    // Prevent double-triggering
                    if (selectedCategories.size > 0) {
                      e.stopPropagation()
                    }
                  }}
                />
                <span>{t.allCategories}</span>
              </label>
            </div>
            {filteredCategories.length > 0 ? (
              filteredCategories.map((catGroup, idx) => (
                <div key={idx} className="category-dropdown-item">
                  <label>
                    <input
                      type="checkbox"
                      checked={selectedCategories.has(catGroup.displayName)}
                      onChange={() => handleToggle(catGroup.displayName)}
                    />
                    <span>{catGroup.displayName}</span>
                    {catGroup.languages.length > 1 && (
                      <span className="category-lang-indicator">
                        {catGroup.languages.join('/')}
                      </span>
                    )}
                  </label>
                </div>
              ))
            ) : searchQuery.trim() ? (
              <div className="category-dropdown-no-results">
                {t.noCategoryResults || 'No categories found'}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
