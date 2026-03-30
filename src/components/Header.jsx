import { useState, useRef, useLayoutEffect, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { translations } from '../constants/translations'
import {
  DESKTOP_HEADER_LAYOUT_MEDIA,
  PHONE_LAYOUT_MEDIA,
  useMatchMedia,
} from '../hooks/useMatchMedia'

const utilSlot = (child) => <div className="header-util-slot">{child}</div>

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
  mobileCompactToolbar = false,
  onMobileCompactToolbarChange,
  webFeedHeaderShrunk = false,
  onWebFeedHeaderShrunkChange,
  headerTabsSlot = null,
}) => {
  const t = translations[uiLanguage]
  const isPhoneLayout = useMatchMedia(PHONE_LAYOUT_MEDIA)
  const isWideFeedHeaderLayout = useMatchMedia(DESKTOP_HEADER_LAYOUT_MEDIA)
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false)
  const launcherRef = useRef(null)
  const sheetRef = useRef(null)

  const useCompactMobileToolbar = Boolean(mobileCompactToolbar && onMobileCompactToolbarChange)

  const githubUrl = 'https://github.com/drenlia/actufeed'

  const expandBtn =
    showDescriptionsBulkToggle && onToggleDescriptionsBulk ? (
      <button
        type="button"
        className={`header-desc-icon-btn${descriptionsBulkExpanded ? ' header-desc-icon-btn--expanded' : ''}`}
        onClick={onToggleDescriptionsBulk}
        title={descriptionsBulkExpanded ? t.shrinkAllDescriptions : t.expandAllDescriptions}
        aria-label={descriptionsBulkExpanded ? t.shrinkAllDescriptions : t.expandAllDescriptions}
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
    ) : null

  const filtersBtn = onToggleFilters ? (
    <button
      type="button"
      className={`header-filters-toggle-btn ${
        filtersCollapsed ? 'header-filters-toggle-btn--off' : 'header-filters-toggle-btn--on'
      }`}
      onClick={onToggleFilters}
      title={filtersCollapsed ? t.showFilters : t.hideFilters}
      aria-label={filtersCollapsed ? t.showFilters : t.hideFilters}
      aria-expanded={!filtersCollapsed}
    >
      <svg className="header-filters-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
      </svg>
    </button>
  ) : null

  const themeBtn = onColorModeToggle ? (
    <button
      type="button"
      className="header-theme-toggle-btn"
      onClick={onColorModeToggle}
      title={colorMode === 'dark' ? t.themeSwitchToLight : t.themeSwitchToDark}
    >
      {colorMode === 'dark' ? '☀️' : '🌙'}
    </button>
  ) : null

  const langBtn = (
    <button
      type="button"
      className="header-lang-toggle-btn"
      onClick={onLanguageToggle}
      title={uiLanguage === 'fr' ? 'Switch to English' : 'Passer au français'}
    >
      {uiLanguage === 'fr' ? 'EN' : 'FR'}
    </button>
  )

  const helpBtn = onHelpClick ? (
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
  ) : null

  const settingsBtn = onSettingsClick ? (
    <button
      type="button"
      className={`header-settings-btn ${isSettingsPage ? 'active' : ''}`}
      onClick={onSettingsClick}
      title={t.settings}
      aria-label={t.settings}
    >
      ⚙️
    </button>
  ) : null

  const toolbarSlots = (
    <>
      {utilSlot(expandBtn)}
      {utilSlot(filtersBtn)}
      {utilSlot(themeBtn)}
      {utilSlot(langBtn)}
      {utilSlot(helpBtn)}
      {utilSlot(settingsBtn)}
    </>
  )

  const closeToolsMenu = useCallback(() => setToolsMenuOpen(false), [])

  const pinToolbar = useCallback(() => {
    onMobileCompactToolbarChange?.(false)
    setToolsMenuOpen(false)
  }, [onMobileCompactToolbarChange])

  const updateSheetPosition = useCallback(() => {
    if (!toolsMenuOpen || !launcherRef.current || !sheetRef.current) return
    const r = launcherRef.current.getBoundingClientRect()
    const sheet = sheetRef.current
    sheet.style.top = `${r.bottom + 8}px`
    const w = sheet.offsetWidth
    const left = Math.max(12, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 12))
    sheet.style.left = `${left}px`
  }, [toolsMenuOpen])

  useLayoutEffect(() => {
    updateSheetPosition()
  }, [updateSheetPosition, toolsMenuOpen])

  useEffect(() => {
    if (!toolsMenuOpen) return undefined
    const onResize = () => updateSheetPosition()
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onResize, true)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onResize, true)
    }
  }, [toolsMenuOpen, updateSheetPosition])

  useEffect(() => {
    if (!toolsMenuOpen) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') closeToolsMenu()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [toolsMenuOpen, closeToolsMenu])

  useEffect(() => {
    if (!useCompactMobileToolbar) setToolsMenuOpen(false)
  }, [useCompactMobileToolbar])

  useEffect(() => {
    if (!isSettingsPage) setToolsMenuOpen(false)
  }, [isSettingsPage])

  const mobileSheet =
    useCompactMobileToolbar && isSettingsPage && toolsMenuOpen
      ? createPortal(
          <>
            <div className="header-mobile-tools-backdrop" role="presentation" onClick={closeToolsMenu} />
            <div
              ref={sheetRef}
              className="header-mobile-tools-sheet"
              role="dialog"
              aria-modal="true"
              aria-label={t.headerMobileToolsMenu}
              onClick={(e) => {
                if (e.target.closest('.header-mobile-tools-sheet__pin')) return
                if (e.target.closest('button')) {
                  window.setTimeout(closeToolsMenu, 0)
                }
              }}
            >
              <div className="header-mobile-tools-sheet__scroll">
                <div className="header-util-toolbar header-util-toolbar--sheet">{toolbarSlots}</div>
              </div>
              <button type="button" className="header-mobile-tools-sheet__pin" onClick={pinToolbar}>
                {t.headerMobilePinToolbar}
              </button>
            </div>
          </>,
          document.body
        )
      : null

  const headerClass = [
    'site-header',
    useCompactMobileToolbar ? 'site-header--mobile-compact-tools' : '',
    webFeedHeaderShrunk && !isSettingsPage && isWideFeedHeaderLayout
      ? 'site-header--feed-web-shrunk'
      : '',
  ]
    .filter(Boolean)
    .join(' ')

  const headerContentClass = [
    'header-content',
    headerTabsSlot ? 'header-content--with-inline-tabs' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const webFeedToggleIcon = webFeedHeaderShrunk ? (
    <svg className="header-web-feed-float-toggle__icon" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M7 10l5 5 5-5H7z" />
    </svg>
  ) : (
    <svg className="header-web-feed-float-toggle__icon" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M7 14l5-5 5 5H7z" />
    </svg>
  )

  const webFeedToggleShared = {
    onClick: () => onWebFeedHeaderShrunkChange?.(!webFeedHeaderShrunk),
    'aria-pressed': webFeedHeaderShrunk,
    title: webFeedHeaderShrunk ? t.headerWebExpandFeedHeader : t.headerWebShrinkFeedHeader,
    'aria-label': webFeedHeaderShrunk ? t.headerWebExpandFeedHeader : t.headerWebShrinkFeedHeader,
  }

  const webFeedToolbarToggle =
    isWideFeedHeaderLayout && !isSettingsPage && onWebFeedHeaderShrunkChange && !webFeedHeaderShrunk ? (
      <button
        type="button"
        className="header-web-feed-float-toggle header-web-feed-float-toggle--toolbar"
        {...webFeedToggleShared}
      >
        {webFeedToggleIcon}
      </button>
    ) : null

  const webFeedFixedToggle =
    isWideFeedHeaderLayout && !isSettingsPage && onWebFeedHeaderShrunkChange && webFeedHeaderShrunk ? (
      <button
        type="button"
        className="header-web-feed-float-toggle header-web-feed-float-toggle--fixed"
        {...webFeedToggleShared}
      >
        {webFeedToggleIcon}
      </button>
    ) : null

  const webFeedFiltersFixedToggle =
    isWideFeedHeaderLayout &&
    !isSettingsPage &&
    webFeedHeaderShrunk &&
    onToggleFilters ? (
      <button
        type="button"
        className={`header-web-feed-float-filters${
          filtersCollapsed ? ' header-web-feed-float-filters--off' : ' header-web-feed-float-filters--on'
        }`}
        onClick={onToggleFilters}
        title={filtersCollapsed ? t.showFilters : t.hideFilters}
        aria-label={filtersCollapsed ? t.showFilters : t.hideFilters}
        aria-expanded={!filtersCollapsed}
      >
        <svg className="header-web-feed-float-filters__icon" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="currentColor" d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
        </svg>
      </button>
    ) : null

  const showWebShrunkTabsBar =
    webFeedHeaderShrunk &&
    !isSettingsPage &&
    isWideFeedHeaderLayout &&
    Boolean(headerTabsSlot)

  const feedTabsInHeader =
    headerTabsSlot && !showWebShrunkTabsBar

  return (
    <>
    <header className={headerClass}>
      <div className={headerContentClass}>
        <div className="header-brand-block">
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
        </div>

        {showArticleCount && articleCount !== undefined && (
          <div className="header-article-count-mobile-wrap">
            <span
              className="header-article-count-mobile"
              aria-live="polite"
              aria-label={`${articleCount} ${articleCount === 1 ? t.articleCount : t.articlesCount}`}
            >
              <strong>{articleCount}</strong>{' '}
              <span className="header-article-count-mobile__word header-article-count-mobile__word--full">
                {articleCount === 1 ? t.articleCount : t.articlesCount}
              </span>
              <span
                className="header-article-count-mobile__word header-article-count-mobile__word--short"
                aria-hidden="true"
              >
                {articleCount === 1 ? t.articleCountMobileAbbr : t.articlesCountMobileAbbr}
              </span>
            </span>
          </div>
        )}

        {isPhoneLayout && !isSettingsPage && onMobileCompactToolbarChange && (
          <button
            type="button"
            className="header-mobile-compact-quick-btn"
            onClick={() => onMobileCompactToolbarChange(!mobileCompactToolbar)}
            aria-pressed={mobileCompactToolbar}
            title={
              mobileCompactToolbar ? t.headerMobileShowToolbarRowQuick : t.headerMobileHideToolbarRowQuick
            }
            aria-label={
              mobileCompactToolbar ? t.headerMobileShowToolbarRowQuick : t.headerMobileHideToolbarRowQuick
            }
          >
            {mobileCompactToolbar ? (
              <svg className="header-mobile-compact-quick-btn__icon" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="currentColor" d="M7 10l5 5 5-5H7z" />
              </svg>
            ) : (
              <svg className="header-mobile-compact-quick-btn__icon" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="currentColor" d="M7 14l5-5 5 5H7z" />
              </svg>
            )}
          </button>
        )}

        {useCompactMobileToolbar && isSettingsPage && (
          <button
            ref={launcherRef}
            type="button"
            className="header-mobile-tools-launcher"
            onClick={() => setToolsMenuOpen((o) => !o)}
            aria-expanded={toolsMenuOpen}
            aria-haspopup="dialog"
            aria-label={t.headerMobileOpenTools}
            title={t.headerMobileOpenTools}
          >
            <svg className="header-mobile-tools-launcher__icon" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"
              />
            </svg>
          </button>
        )}

        {feedTabsInHeader ? <div className="header-feed-tabs">{headerTabsSlot}</div> : null}

        <div className="header-desktop-actions">
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

          <div className="header-util-toolbar">
            {toolbarSlots}
            {utilSlot(webFeedToolbarToggle)}
          </div>
        </div>
      </div>
      {mobileSheet}
    </header>
    {showWebShrunkTabsBar ? (
      <div className="feed-chrome-shrunk-tabs">
        <div className="header-feed-tabs">{headerTabsSlot}</div>
      </div>
    ) : null}
    {webFeedFiltersFixedToggle}
    {webFeedFixedToggle}
    </>
  )
}
