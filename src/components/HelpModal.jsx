import { useState, useEffect, useRef, useCallback } from 'react'
import { translations } from '../constants/translations'

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function highlightText(text, query, keyPrefix) {
  const q = query.trim()
  if (!q) return text
  let re
  try {
    re = new RegExp(escapeRegExp(q), 'gi')
  } catch {
    return text
  }
  const out = []
  let last = 0
  let m
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index))
    out.push(
      <mark key={`${keyPrefix}-${m.index}-${out.length}`} className="help-modal__mark">
        {m[0]}
      </mark>
    )
    last = m.index + m[0].length
    if (m[0].length === 0) {
      re.lastIndex += 1
      if (re.lastIndex > text.length) break
    }
  }
  if (last < text.length) out.push(text.slice(last))
  return out.length > 0 ? out : text
}

export const HelpModal = ({ open, onClose, uiLanguage, settingsOnly = false }) => {
  const t = translations[uiLanguage]
  const [searchQuery, setSearchQuery] = useState('')
  const bodyRef = useRef(null)
  const closeBtnRef = useRef(null)

  const feedRows = settingsOnly ? [] : t.helpFeedTable || []
  const settingsRows = t.helpSettingsTable || []

  const rowMatches = (row, needle) => {
    if (!needle) return true
    const q = needle.toLowerCase()
    return (
      row.group.toLowerCase().includes(q) || row.text.toLowerCase().includes(q)
    )
  }

  useEffect(() => {
    if (!open) {
      setSearchQuery('')
      return
    }
    closeBtnRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const scrollToFirstHit = useCallback(() => {
    const q = searchQuery.trim()
    if (!q || !bodyRef.current) return
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        bodyRef.current?.querySelector('.help-modal__mark')?.scrollIntoView({
          block: 'center',
          behavior: 'smooth',
        })
      })
    })
  }, [searchQuery])

  useEffect(() => {
    if (!open) return
    scrollToFirstHit()
  }, [open, searchQuery, uiLanguage, scrollToFirstHit])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!open) return null

  const q = searchQuery.trim()
  const modalTitle = settingsOnly ? t.helpModalTitleSettings : t.helpModalTitle
  const noMatches =
    q &&
    !feedRows.some((row) => rowMatches(row, q)) &&
    !settingsRows.some((row) => rowMatches(row, q))

  return (
    <div
      className="help-modal-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="help-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-modal-title"
      >
        <div className="help-modal__top">
          <h2 id="help-modal-title" className="help-modal__title">
            {modalTitle}
          </h2>
          <button
            ref={closeBtnRef}
            type="button"
            className="help-modal__close"
            onClick={onClose}
            aria-label={t.helpModalClose}
          >
            ×
          </button>
        </div>
        <p className="help-modal__hint">{t.helpModalHint}</p>
        <div className="help-modal__search-wrap">
          <input
            type="search"
            className="help-modal__search"
            placeholder={t.helpModalSearchPlaceholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label={t.helpModalSearchPlaceholder}
          />
        </div>
        {noMatches && <p className="help-modal__no-match">{t.helpModalNoMatches}</p>}
        <div ref={bodyRef} className="help-modal__body">
          {!settingsOnly && (
            <section className="help-modal__section">
              <h3 id="help-modal-feed-heading" className="help-modal__section-title">
                {t.helpSectionFeed}
              </h3>
              <div className="help-modal__table-scroll">
                <table
                  className="help-modal__table"
                  aria-labelledby="help-modal-feed-heading"
                >
                  <tbody>
                    {feedRows.map((row, i) => (
                      <tr key={`f-${i}`}>
                        <th scope="row" className="help-modal__td-group">
                          {highlightText(row.group, searchQuery, `fg-${i}`)}
                        </th>
                        <td className="help-modal__td-desc">
                          {highlightText(row.text, searchQuery, `fd-${i}`)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
          <section className="help-modal__section">
            <h3 id="help-modal-settings-heading" className="help-modal__section-title">
              {t.helpSectionSettings}
            </h3>
            <div className="help-modal__table-scroll">
              <table
                className="help-modal__table"
                aria-labelledby="help-modal-settings-heading"
              >
                <tbody>
                  {settingsRows.map((row, i) => (
                    <tr key={`s-${i}`}>
                      <th scope="row" className="help-modal__td-group">
                        {highlightText(row.group, searchQuery, `sg-${i}`)}
                      </th>
                      <td className="help-modal__td-desc">
                        {highlightText(row.text, searchQuery, `sd-${i}`)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
