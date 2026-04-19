import { useCallback, useEffect, useId, useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { translations } from '../constants/translations'
import { GUIDED_TOUR_STEP_TARGET_LISTS } from '../constants/guidedTour'
import { useMatchMedia, GUIDED_TOUR_TOUCH_COPY_MEDIA } from '../hooks/useMatchMedia'

const PAD = 10

/** Replace `{{kbd:X}}` segments with styled keyboard keys (body or title). */
export function renderGuidedTourRichText(text) {
  if (text == null || text === '') return null
  const s = String(text)
  const re = /\{\{kbd:([^}]+)\}\}/g
  const out = []
  let last = 0
  let m
  let k = 0
  while ((m = re.exec(s)) !== null) {
    if (m.index > last) {
      out.push(
        <span key={`t-${k}`}>
          {s.slice(last, m.index)}
        </span>
      )
      k += 1
    }
    out.push(
      <kbd key={`kbd-${k}`} className="guided-tour-kbd">
        {m[1]}
      </kbd>
    )
    k += 1
    last = m.index + m[0].length
  }
  if (last < s.length) {
    out.push(<span key={`t-${k}`}>{s.slice(last)}</span>)
  }
  return <>{out}</>
}

function unionBoundingRect(nodes) {
  let top = Infinity
  let left = Infinity
  let right = -Infinity
  let bottom = -Infinity
  let any = false
  for (const el of nodes) {
    if (!el?.isConnected) continue
    const r = el.getBoundingClientRect()
    if (!r.width && !r.height) continue
    any = true
    top = Math.min(top, r.top)
    left = Math.min(left, r.left)
    right = Math.max(right, r.right)
    bottom = Math.max(bottom, r.bottom)
  }
  if (!any) return null
  return {
    top: top - PAD,
    left: left - PAD,
    right: right + PAD,
    bottom: bottom + PAD,
  }
}

/**
 * One rect per `data-tour` name (union nodes that share a name).
 * Multiple names ⇒ multiple holes — no single huge box across far-apart UI.
 */
function useTourTargetRects(active, targetNames) {
  const [rects, setRects] = useState([])

  const measure = useCallback(() => {
    if (!active || !targetNames || targetNames.length === 0) {
      setRects([])
      return
    }
    const out = []
    for (const name of targetNames) {
      const nodes = [...document.querySelectorAll(`[data-tour="${name}"]`)]
      const u = unionBoundingRect(nodes)
      if (u) out.push(u)
    }
    setRects(out)
    const first = document.querySelector(`[data-tour="${targetNames[0]}"]`)
    first?.scrollIntoView({ block: 'nearest', behavior: 'auto' })
  }, [active, targetNames])

  useLayoutEffect(() => {
    measure()
    let cancelled = false
    const id1 = requestAnimationFrame(() => {
      if (cancelled) return
      measure()
      requestAnimationFrame(() => {
        if (!cancelled) measure()
      })
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(id1)
    }
  }, [measure])

  useEffect(() => {
    if (!active) return undefined
    const onResize = () => measure()
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onResize, true)
    let moRaf = null
    const scheduleFromDom = () => {
      if (moRaf != null) return
      moRaf = requestAnimationFrame(() => {
        moRaf = null
        measure()
      })
    }
    const mo = new MutationObserver(scheduleFromDom)
    mo.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-tour', 'class', 'style'],
    })
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onResize, true)
      mo.disconnect()
      if (moRaf != null) cancelAnimationFrame(moRaf)
    }
  }, [active, measure])

  return rects
}

export function GuidedTourOverlay({
  open,
  stepIndex,
  uiLanguage,
  onNext,
  onBack,
  onSkip,
}) {
  const t = translations[uiLanguage]
  const touchTourCopy = useMatchMedia(GUIDED_TOUR_TOUCH_COPY_MEDIA)
  const steps =
    touchTourCopy && Array.isArray(t.tourStepsTouch) && t.tourStepsTouch.length > 0
      ? t.tourStepsTouch
      : t.tourSteps || []
  const total = steps.length
  const safeIndex = Math.min(Math.max(0, stepIndex), Math.max(0, total - 1))
  const step = steps[safeIndex]
  const targetNames = GUIDED_TOUR_STEP_TARGET_LISTS[safeIndex] || []
  const rects = useTourTargetRects(open && !!step, targetNames)
  const maskId = `gt-${useId().replace(/:/g, '')}`

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onSkip?.()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onSkip])

  if (!open || !step) return null

  const progress = t.tourStepProgress
    .replace('{current}', String(safeIndex + 1))
    .replace('{total}', String(total))

  const vw = typeof window !== 'undefined' ? window.innerWidth : 0
  const vh = typeof window !== 'undefined' ? window.innerHeight : 0

  const hasHoles = rects.length > 0 && rects.some((r) => r.right > r.left && r.bottom > r.top)

  const backdrop = (
    <div className="guided-tour-root" aria-live="polite">
      {hasHoles ? (
        <svg
          className="guided-tour-dim-svg"
          width="100%"
          height="100%"
          aria-hidden
          style={{ position: 'fixed', inset: 0, pointerEvents: 'auto' }}
        >
          <defs>
            <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width={vw} height={vh}>
              <rect x="0" y="0" width={vw} height={vh} fill="white" />
              {rects.map((r, i) => {
                const w = Math.max(0, r.right - r.left)
                const h = Math.max(0, r.bottom - r.top)
                if (w < 1 || h < 1) return null
                return <rect key={i} x={r.left} y={r.top} width={w} height={h} fill="black" />
              })}
            </mask>
          </defs>
          <rect
            x="0"
            y="0"
            width={vw}
            height={vh}
            className="guided-tour-dim-svg-fill"
            mask={`url(#${maskId})`}
          />
        </svg>
      ) : (
        <div className="guided-tour-dim guided-tour-dim--full" />
      )}
      <div className="guided-tour-card" role="dialog" aria-modal="true" aria-labelledby="guided-tour-step-title">
        <p className="guided-tour-progress">{progress}</p>
        <h2 id="guided-tour-step-title" className="guided-tour-title">
          {renderGuidedTourRichText(step.title)}
        </h2>
        <p className="guided-tour-body">{renderGuidedTourRichText(step.body)}</p>
        <div className="guided-tour-actions">
          <button type="button" className="guided-tour-btn guided-tour-btn--ghost" onClick={onSkip}>
            {t.tourSkipTour}
          </button>
          <div className="guided-tour-actions__main">
            <button
              type="button"
              className="guided-tour-btn guided-tour-btn--secondary"
              onClick={onBack}
              disabled={safeIndex <= 0}
            >
              {t.tourBack}
            </button>
            <button type="button" className="guided-tour-btn guided-tour-btn--primary" onClick={onNext}>
              {safeIndex >= total - 1 ? t.tourEndTour || t.tourNext : t.tourNext}
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  return typeof document !== 'undefined' ? createPortal(backdrop, document.body) : null
}
