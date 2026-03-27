import { translations } from '../constants/translations'

export const Header = ({
  uiLanguage,
  onLanguageToggle,
  articleCount,
  totalCount,
  onSettingsClick,
  showArticleCount = true,
  isSettingsPage = false,
  onTitleClick,
  onHelpClick,
  colorMode = 'light',
  onColorModeToggle,
  filtersCollapsed,
  onToggleFilters,
  showDescriptionsBulkToggle = false,
  descriptionsBulkExpanded = false,
  onToggleDescriptionsBulk,
}) => {
  const t = translations[uiLanguage]

  // GitHub repository URL
  const githubUrl = 'https://github.com/drenlia/actufeed'

  const showFeedUtilRow =
    (showDescriptionsBulkToggle && onToggleDescriptionsBulk) ||
    onToggleFilters ||
    onHelpClick

  return (
    <header className="site-header">
      <div className="header-content">
        <div className="header-left">
          <div className="header-brand-row">
            <a
              href={githubUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="github-link"
              title="View on GitHub"
            >
              <svg
                className="github-icon"
                viewBox="0 0 24 24"
                fill="currentColor"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
            </a>
            <button
              type="button"
              className="site-title site-title-btn"
              onClick={() => onTitleClick?.()}
              title={isSettingsPage ? t.titleBackToFeed : t.title}
            >
              {t.title}
            </button>
          </div>
          {showArticleCount && articleCount !== undefined && (
            <span className="header-article-count-mobile" aria-live="polite">
              <strong>{articleCount}</strong>{' '}
              {articleCount === 1 ? t.articleCount : t.articlesCount}
            </span>
          )}
        </div>
        <div className="header-right">
          {showArticleCount && articleCount !== undefined && (
            <div className="header-news-meta header-news-meta--desktop">
              <div className="news-counter">
                <span className="counter-text">
                  {t.showing} <strong>{articleCount}</strong>{' '}
                  {articleCount === 1 ? t.articleCount : t.articlesCount}
                  {totalCount !== undefined && totalCount !== articleCount && (
                    <span className="counter-total">
                      {' '}
                      / {totalCount} {t.articlesCount}
                    </span>
                  )}
                </span>
              </div>
            </div>
          )}
          <div className="header-util-row header-util-row--prefs">
            <div className="header-util-slot">
              {onSettingsClick ? (
                <button
                  type="button"
                  className={`header-settings-btn ${isSettingsPage ? 'active' : ''}`}
                  onClick={onSettingsClick}
                  title={t.settings}
                  aria-label={t.settings}
                >
                  ⚙️
                </button>
              ) : null}
            </div>
            <div className="header-util-slot">
              {onColorModeToggle ? (
                <button
                  type="button"
                  className="header-theme-toggle-btn"
                  onClick={onColorModeToggle}
                  title={colorMode === 'dark' ? t.themeSwitchToLight : t.themeSwitchToDark}
                >
                  {colorMode === 'dark' ? '☀️' : '🌙'}
                </button>
              ) : null}
            </div>
            <div className="header-util-slot">
              <button
                className="header-lang-toggle-btn"
                onClick={onLanguageToggle}
                title={uiLanguage === 'fr' ? 'Switch to English' : 'Passer au français'}
              >
                {uiLanguage === 'fr' ? 'EN' : 'FR'}
              </button>
            </div>
          </div>
          {showFeedUtilRow && (
            <div className="header-util-row header-util-row--feed">
              <div className="header-util-slot">
                {showDescriptionsBulkToggle && onToggleDescriptionsBulk ? (
                  <button
                    type="button"
                    className={`header-desc-icon-btn${descriptionsBulkExpanded ? ' header-desc-icon-btn--expanded' : ''}`}
                    onClick={onToggleDescriptionsBulk}
                    title={
                      descriptionsBulkExpanded ? t.shrinkAllDescriptions : t.expandAllDescriptions
                    }
                    aria-label={
                      descriptionsBulkExpanded ? t.shrinkAllDescriptions : t.expandAllDescriptions
                    }
                    aria-pressed={descriptionsBulkExpanded}
                  >
                    <svg className="header-desc-bulk-icon" viewBox="0 0 24 24" aria-hidden="true">
                      {descriptionsBulkExpanded ? (
                        <path
                          fill="currentColor"
                          d="M7.41 18.41L6 17l6-6 6 6-1.41 1.41L12 13.83l-4.59 4.58zm0-6L6 11l6-6 6 6-1.41 1.41L12 7.83l-4.59 4.58z"
                        />
                      ) : (
                        <path
                          fill="currentColor"
                          d="M16.59 5.59L18 7l-6 6-6-6 1.41-1.41L12 10.17l4.59-4.58zm0 6L18 13l-6 6-6-6 1.41-1.41L12 16.17l4.59-4.58z"
                        />
                      )}
                    </svg>
                  </button>
                ) : null}
              </div>
              <div className="header-util-slot">
                {onToggleFilters ? (
                  <button
                    type="button"
                    className={`header-filters-toggle-btn ${
                      filtersCollapsed
                        ? 'header-filters-toggle-btn--off'
                        : 'header-filters-toggle-btn--on'
                    }`}
                    onClick={onToggleFilters}
                    title={filtersCollapsed ? t.showFilters : t.hideFilters}
                    aria-label={filtersCollapsed ? t.showFilters : t.hideFilters}
                    aria-expanded={!filtersCollapsed}
                  >
                    <svg className="header-filters-icon" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        fill="currentColor"
                        d="M4 6h16v2H4V6zm3 5h10v2H7v-2zm3.5 5h5v2h-5v-2z"
                      />
                    </svg>
                  </button>
                ) : null}
              </div>
              <div className="header-util-slot">
                {onHelpClick ? (
                  <button
                    type="button"
                    className="header-help-btn"
                    onClick={onHelpClick}
                    aria-label={isSettingsPage ? t.helpModalTitleSettings : t.helpModalTitle}
                    title={`${isSettingsPage ? t.helpModalTitleSettings : t.helpModalTitle} · F1`}
                  >
                    <svg
                      className="header-help-icon"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      aria-hidden="true"
                    >
                      <circle
                        className="header-help-icon-ring"
                        cx="12"
                        cy="12"
                        r="9.5"
                        stroke="currentColor"
                        strokeWidth="1.1"
                      />
                      <path
                        className="header-help-icon-mark"
                        stroke="currentColor"
                        strokeWidth="1.65"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"
                      />
                      <circle className="header-help-icon-dot" cx="12" cy="17" r="0.9" fill="currentColor" />
                    </svg>
                  </button>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
