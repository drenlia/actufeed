import { useEffect, useMemo } from 'react'
import { translations } from '../constants/translations'
import { APP_STORE_URL, GOOGLE_PLAY_STORE_URL } from '../constants/appStore'

const QR_BASE = 'https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=10'

function qrImgSrcForUrl(storeUrl) {
  return `${QR_BASE}&data=${encodeURIComponent(storeUrl)}`
}

/**
 * QR modal for scanning a phone to open the native store listing — App Store or Google Play.
 * @param {{ open: boolean; onClose: () => void; uiLanguage: string; storeKind?: 'appstore' | 'googleplay' }} props
 */
export const AppStoreQrModal = ({
  open,
  onClose,
  uiLanguage,
  storeKind = 'appstore',
}) => {
  const t = translations[uiLanguage]
  const isPlay = storeKind === 'googleplay'
  const storeUrl = isPlay ? GOOGLE_PLAY_STORE_URL : APP_STORE_URL
  const qrSrc = useMemo(() => qrImgSrcForUrl(storeUrl), [storeUrl])

  const title = isPlay ? t.googlePlayQrModalTitle : t.appStoreQrModalTitle
  const lead = isPlay ? t.googlePlayQrModalLead : t.appStoreQrModalLead
  const hint = isPlay ? t.googlePlayQrModalHint : t.appStoreQrModalHint
  const openStoreLabel = isPlay ? t.googlePlayQrModalOpenStore : t.appStoreQrModalOpenStore

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
        aria-labelledby="store-qr-modal-title"
      >
        <div className="appstore-qr-modal__head">
          <h2 id="store-qr-modal-title" className="appstore-qr-modal__title">
            {title}
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
        <p className="appstore-qr-modal__lead">{lead}</p>
        <div className="appstore-qr-modal__qr-wrap">
          <img
            src={qrSrc}
            alt=""
            width={220}
            height={220}
            className="appstore-qr-modal__qr"
            decoding="async"
          />
        </div>
        <p className="appstore-qr-modal__hint">{hint}</p>
        <a
          className="appstore-qr-modal__link"
          href={storeUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          {openStoreLabel}
        </a>
      </div>
    </div>
  )
}
