import { useEffect } from 'react'
import { translations } from '../constants/translations'
import { APP_STORE_URL } from '../constants/appStore'

const QR_IMG = (() => {
  const encoded = encodeURIComponent(APP_STORE_URL)
  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=10&data=${encoded}`
})()

export const AppStoreQrModal = ({ open, onClose, uiLanguage }) => {
  const t = translations[uiLanguage]

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return undefined
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!open) return null

  return (
    <div
      className="appstore-qr-modal-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="appstore-qr-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="appstore-qr-modal-title"
      >
        <div className="appstore-qr-modal__head">
          <h2 id="appstore-qr-modal-title" className="appstore-qr-modal__title">
            {t.appStoreQrModalTitle}
          </h2>
          <button
            type="button"
            className="appstore-qr-modal__close"
            onClick={onClose}
            aria-label={t.appStoreQrModalClose}
            title={t.appStoreQrModalClose}
          >
            ×
          </button>
        </div>
        <p className="appstore-qr-modal__lead">{t.appStoreQrModalLead}</p>
        <div className="appstore-qr-modal__qr-wrap">
          <img
            src={QR_IMG}
            alt=""
            width={220}
            height={220}
            className="appstore-qr-modal__qr"
            decoding="async"
          />
        </div>
        <p className="appstore-qr-modal__hint">{t.appStoreQrModalHint}</p>
        <a
          className="appstore-qr-modal__link"
          href={APP_STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t.appStoreQrModalOpenStore}
        </a>
      </div>
    </div>
  )
}
