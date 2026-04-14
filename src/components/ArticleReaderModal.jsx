import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { apiUrl } from '../utils/apiBase'
import { copyTextToClipboard } from '../utils/copyToClipboard'
import { translations } from '../constants/translations'
import { useToastContext } from '../contexts/ToastContext'
import { ArticleExtractBody } from './ArticleExtractBody'

export function ArticleReaderModal({ item, onClose, uiLanguage }) {
  const t = translations[uiLanguage]
  const { success } = useToastContext()

  const [phase, setPhase] = useState('loading')
  const [extract, setExtract] = useState(null)
  const [thumbFailed, setThumbFailed] = useState(false)
  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)
  const [shareCopyFailed, setShareCopyFailed] = useState(false)
  const shareSheetRef = useRef(null)
  const shareUrlInputRef = useRef(null)

  const heroSrc = useMemo(() => {
    if (item.thumbnail && !thumbFailed) return item.thumbnail
    return item.feedLogo || null
  }, [item.thumbnail, item.feedLogo, thumbFailed])

  const displayTitle = useMemo(() => {
    if (extract?.ok && extract.title && String(extract.title).trim()) {
      return String(extract.title).trim()
    }
    return (item.title || '').trim() || t.articleReaderUntitled
  }, [extract, item.title, t.articleReaderUntitled])

  useEffect(() => {
    const ac = new AbortController()
    const url = apiUrl(`/api/article/extract?url=${encodeURIComponent(item.link)}`)
    fetch(url, { signal: ac.signal })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setExtract({
            ok: false,
            error: typeof data.error === 'string' ? data.error : t.articleReaderErrorGeneric,
          })
          setPhase('error')
          return
        }
        setExtract(data)
        setPhase(data.ok ? 'article' : 'error')
      })
      .catch((e) => {
        if (e.name === 'AbortError') return
        setExtract({ ok: false, error: t.articleReaderErrorGeneric })
        setPhase('error')
      })

    return () => ac.abort()
  }, [item.link, t.articleReaderErrorGeneric])

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      if (shareModalOpen) {
        setShareModalOpen(false)
        return
      }
      onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, shareModalOpen])

  const openPublisher = useCallback(() => {
    window.open(item.link, '_blank', 'noopener,noreferrer')
  }, [item.link])

  const canUseNativeShare =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  const openShareModal = useCallback(() => {
    setShareCopied(false)
    setShareCopyFailed(false)
    setShareModalOpen(true)
  }, [])

  const closeShareModal = useCallback(() => {
    setShareModalOpen(false)
    setShareCopied(false)
    setShareCopyFailed(false)
  }, [])

  const handleShareCopy = useCallback(async () => {
    const url = item.link
    setShareCopyFailed(false)
    const ok = await copyTextToClipboard(url)
    if (ok) {
      setShareCopied(true)
      success(t.articleReaderLinkCopied)
      window.setTimeout(() => setShareCopied(false), 2200)
    } else {
      setShareCopied(false)
      setShareCopyFailed(true)
      window.requestAnimationFrame(() => {
        const el = shareUrlInputRef.current
        if (el) {
          el.focus()
          el.select()
        }
      })
    }
  }, [item.link, success, t.articleReaderLinkCopied])

  const handleNativeShareFromSheet = useCallback(async () => {
    const url = item.link
    const title = displayTitle
    try {
      await navigator.share({ title, url, text: title })
      closeShareModal()
    } catch (e) {
      if (e && e.name === 'AbortError') return
    }
  }, [closeShareModal, displayTitle, item.link])

  useEffect(() => {
    if (!shareModalOpen) return undefined
    const id = window.requestAnimationFrame(() => {
      shareSheetRef.current?.querySelector('.article-reader-share-sheet__btn--primary')?.focus()
    })
    return () => window.cancelAnimationFrame(id)
  }, [shareModalOpen])

  const modalTitleId = 'article-reader-modal-title'

  return (
    <div
      className="article-reader-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby={modalTitleId}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="article-reader-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="article-reader-modal__header">
          <button
            type="button"
            className="article-reader-modal__icon-btn article-reader-modal__icon-btn--back"
            onClick={onClose}
            aria-label={t.articleReaderBackA11y}
          >
            <span aria-hidden>‹</span>
          </button>
          <h1 id={modalTitleId} className="article-reader-modal__title" title={displayTitle}>
            {displayTitle}
          </h1>
          <div className="article-reader-modal__header-actions">
            <button
              type="button"
              className="article-reader-modal__icon-btn"
              onClick={openShareModal}
              aria-label={t.articleReaderShareA11y}
              title={t.articleReaderShareA11y}
              aria-expanded={shareModalOpen}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
                <path
                  fill="currentColor"
                  d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.27.81 2.09.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z"
                />
              </svg>
            </button>
            <button
              type="button"
              className="article-reader-modal__icon-btn"
              onClick={openPublisher}
              aria-label={t.articleReaderOpenPublisherA11y}
              title={t.articleReaderOpenPublisherA11y}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.75" />
                <path
                  d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
                  stroke="currentColor"
                  strokeWidth="1.75"
                />
              </svg>
            </button>
            <button
              type="button"
              className="article-reader-modal__icon-btn article-reader-modal__icon-btn--close"
              onClick={onClose}
              aria-label={t.articleReaderCloseA11y}
              title={t.articleReaderCloseA11y}
            >
              <span aria-hidden className="article-reader-modal__close-glyph">
                ×
              </span>
            </button>
          </div>
        </header>

        <div className="article-reader-modal__scroll">
          {heroSrc ? (
            <div className="article-reader-modal__hero">
              <img
                src={heroSrc}
                alt=""
                className="article-reader-modal__hero-img"
                onError={() => setThumbFailed(true)}
                decoding="async"
              />
            </div>
          ) : null}

          {extract?.ok && extract.byline ? (
            <p className="article-reader-modal__byline">{extract.byline}</p>
          ) : null}

          {extract?.ok && extract.paywallLikely ? (
            <p className="article-reader-modal__paywall" role="status">
              {t.articleReaderPaywallHint}
            </p>
          ) : null}

          {phase === 'loading' ? (
            <p className="article-reader-modal__loading" role="status">
              {t.articleReaderLoading}
            </p>
          ) : null}

          {phase === 'error' && extract ? (
            <div className="article-reader-modal__fallback" role="alert">
              <p className="article-reader-modal__error-text">
                {typeof extract.error === 'string' ? extract.error : t.articleReaderErrorGeneric}
              </p>
              <a
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="article-reader-modal__fallback-link"
              >
                {t.articleReaderOpenInNewTab}
              </a>
            </div>
          ) : null}

          {phase === 'article' && extract?.ok && extract.text ? (
            <ArticleExtractBody text={extract.text} />
          ) : null}
        </div>

        {shareModalOpen ? (
          <div
            className="article-reader-share-overlay"
            role="presentation"
            onClick={closeShareModal}
          >
            <div
              ref={shareSheetRef}
              className="article-reader-share-sheet"
              role="dialog"
              aria-modal="true"
              aria-labelledby="article-reader-share-title"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="article-reader-share-sheet__head">
                <h2 id="article-reader-share-title" className="article-reader-share-sheet__title">
                  {t.articleReaderShareModalTitle}
                </h2>
                <button
                  type="button"
                  className="article-reader-share-sheet__close"
                  onClick={closeShareModal}
                  aria-label={t.helpModalClose}
                >
                  <span aria-hidden>×</span>
                </button>
              </div>
              <p className="article-reader-share-sheet__article-title">{displayTitle}</p>
              <label className="article-reader-share-sheet__label" htmlFor="article-reader-share-url">
                {t.articleReaderShareModalUrlLabel}
              </label>
              <div className="article-reader-share-sheet__url-wrap">
                <input
                  ref={shareUrlInputRef}
                  id="article-reader-share-url"
                  type="text"
                  readOnly
                  className="article-reader-share-sheet__url-input"
                  value={item.link}
                  onFocus={(e) => e.target.select()}
                />
              </div>
              {shareCopyFailed ? (
                <p className="article-reader-share-sheet__hint article-reader-share-sheet__hint--warn" role="status">
                  {t.articleReaderShareModalCopyFailed}
                </p>
              ) : null}
              <div className="article-reader-share-sheet__actions">
                <button
                  type="button"
                  className={`article-reader-share-sheet__btn article-reader-share-sheet__btn--primary${
                    shareCopied ? ' is-done' : ''
                  }`}
                  onClick={handleShareCopy}
                >
                  {shareCopied ? t.articleReaderShareModalCopiedShort : t.articleReaderShareModalCopy}
                </button>
                {canUseNativeShare ? (
                  <button
                    type="button"
                    className="article-reader-share-sheet__btn article-reader-share-sheet__btn--secondary"
                    onClick={handleNativeShareFromSheet}
                  >
                    {t.articleReaderShareModalDevice}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
