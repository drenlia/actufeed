import { createPortal } from 'react-dom'
import { translations } from '../constants/translations'

export function WelcomeModal({
  open,
  uiLanguage,
  onPickLanguage,
  onSkip,
  onStartTour,
}) {
  if (!open) return null

  const t = translations[uiLanguage]

  const content = (
    <div
      className="welcome-modal-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onSkip?.()
      }}
    >
      <div
        className="welcome-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="welcome-modal__top">
          <div className="help-modal__lang" role="group" aria-label={t.helpModalLangGroupAria}>
            <button
              type="button"
              className={
                uiLanguage === 'fr'
                  ? 'help-modal__lang-btn help-modal__lang-btn--active'
                  : 'help-modal__lang-btn'
              }
              onClick={() => onPickLanguage?.('fr')}
              aria-pressed={uiLanguage === 'fr'}
              aria-label={t.welcomeModalLangTitleFr}
              title={t.welcomeModalLangTitleFr}
            >
              FR
            </button>
            <button
              type="button"
              className={
                uiLanguage === 'en'
                  ? 'help-modal__lang-btn help-modal__lang-btn--active'
                  : 'help-modal__lang-btn'
              }
              onClick={() => onPickLanguage?.('en')}
              aria-pressed={uiLanguage === 'en'}
              aria-label={t.welcomeModalLangTitleEn}
              title={t.welcomeModalLangTitleEn}
            >
              EN
            </button>
          </div>
        </div>
        <div className="welcome-modal__brand">
          <img
            src="/actufeed-icon.svg"
            alt=""
            className="welcome-modal__logo"
            width={56}
            height={56}
            decoding="async"
          />
          <h2 id="welcome-modal-title" className="welcome-modal__title">
            {t.welcomeModalTitle}
          </h2>
        </div>
        <div className="welcome-modal__body-stack">
          <p className="welcome-modal__body">{t.welcomeModalBody}</p>
          {t.welcomeModalBodySecond ? (
            <p className="welcome-modal__body">{t.welcomeModalBodySecond}</p>
          ) : null}
        </div>
        <div className="welcome-modal__actions">
          <button type="button" className="welcome-modal__btn welcome-modal__btn--secondary" onClick={onSkip}>
            {t.welcomeModalSkip}
          </button>
          <button type="button" className="welcome-modal__btn welcome-modal__btn--primary" onClick={onStartTour}>
            {t.welcomeModalStart}
          </button>
        </div>
      </div>
    </div>
  )

  return typeof document !== 'undefined' ? createPortal(content, document.body) : null
}
