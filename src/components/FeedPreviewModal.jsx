import { useEffect } from 'react'
import { NewsItem } from './NewsItem'

const EMPTY_NEW_IDS = new Set()

/**
 * Modal: first parsed article as it appears in the feed, with option to add a non-standard feed anyway.
 */
export function FeedPreviewModal({
  open,
  onClose,
  uiLanguage,
  t,
  previewItem,
  loading,
  previewError,
  validationErrors = [],
  validationWarnings = [],
  /** Field keys/phrases from validator (e.g. description, pubDate) — shown in accent color */
  missingRequiredItemFields = [],
  /** Sample items had no item-level thumbnails (feed logo fallback only) */
  itemLevelImagesMissing = false,
  onAddAnyway,
  addAnywayDisabled,
}) {
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const otherValidationErrors = validationErrors.filter(
    (e) => !/^Feed items are missing required fields:/i.test(String(e))
  )

  const previewWarningsDeduped =
    itemLevelImagesMissing && validationWarnings.length > 0
      ? validationWarnings.filter(
          (w) => !String(w).startsWith('Sample entries have no per-article images')
        )
      : validationWarnings

  return (
    <div
      className="feed-preview-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="feed-preview-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="feed-preview-modal">
        <div className="feed-preview-modal__top">
          <h2 id="feed-preview-modal-title" className="feed-preview-modal__title">
            {t.feedPreviewModalTitle}
          </h2>
          <button
            type="button"
            className="feed-preview-modal__close"
            onClick={onClose}
            aria-label={t.feedPreviewCloseA11y}
          >
            ×
          </button>
        </div>

        <p className="feed-preview-modal__lead">{t.feedPreviewLead}</p>

        {(missingRequiredItemFields.length > 0 ||
          otherValidationErrors.length > 0 ||
          previewWarningsDeduped.length > 0 ||
          itemLevelImagesMissing) && (
          <div className="feed-preview-modal__validation" role="status">
            {missingRequiredItemFields.length > 0 ? (
              <div className="feed-preview-modal__validation-block">
                <strong>{t.feedMissingFields}</strong>
                <p className="feed-preview-modal__missing-fields-line">
                  <span className="feed-preview-modal__missing-fields-intro">{t.feedPreviewMissingFieldsIntro}</span>
                  {missingRequiredItemFields.map((name, i) => (
                    <span key={`${name}-${i}`}>
                      {i > 0 ? <span className="feed-preview-modal__missing-sep">, </span> : ' '}
                      <span className="feed-preview-modal__missing-field">{name}</span>
                    </span>
                  ))}
                </p>
              </div>
            ) : null}
            {otherValidationErrors.length > 0 ? (
              <div className="feed-preview-modal__validation-block">
                <strong>{t.feedInvalid}</strong>
                <ul>
                  {otherValidationErrors.map((err, i) => (
                    <li key={`e-${i}`}>{err}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {previewWarningsDeduped.length > 0 ? (
              <div className="feed-preview-modal__validation-block feed-preview-modal__validation-block--warn">
                <strong>{t.feedWarnings}</strong>
                <ul>
                  {previewWarningsDeduped.map((w, i) => (
                    <li key={`w-${i}`}>{w}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {itemLevelImagesMissing ? (
              <p className="feed-preview-modal__no-images-note" role="status">
                {t.feedPreviewNoItemImagesNote}
              </p>
            ) : null}
          </div>
        )}

        <div className="feed-preview-modal__scroll">
          {loading ? (
            <p className="feed-preview-modal__loading">{t.feedPreviewLoading}</p>
          ) : previewError ? (
            <p className="feed-preview-modal__error" role="alert">
              {previewError}
            </p>
          ) : previewItem ? (
            <div
              className="feed-preview-modal__card-wrap"
              style={{ '--news-desc-scale': '1' }}
            >
              <div className="news-list news-list--layout-list feed-preview-modal__news-list">
                <NewsItem
                  item={previewItem}
                  uiLanguage={uiLanguage}
                  isNew={false}
                  combinedCategories={[]}
                  onArticleMetaFilter={null}
                  expandAllSignal={null}
                  readLaterVariant={null}
                  newItemIds={EMPTY_NEW_IDS}
                />
              </div>
            </div>
          ) : null}
        </div>

        <div className="feed-preview-modal__actions">
          <button type="button" className="feed-preview-modal__btn feed-preview-modal__btn--secondary" onClick={onClose}>
            {t.feedPreviewCancel}
          </button>
          <button
            type="button"
            className="feed-preview-modal__btn feed-preview-modal__btn--primary add-validated-feed-btn"
            onClick={onAddAnyway}
            disabled={addAnywayDisabled || loading || !!previewError || !previewItem}
          >
            {t.feedPreviewAddAnyway}
          </button>
        </div>
      </div>
    </div>
  )
}
