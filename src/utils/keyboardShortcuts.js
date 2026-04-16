/**
 * Whether the user is likely typing in a field (skip global single-key shortcuts).
 * Read-only inputs are treated as non-typing so shortcuts like +/- still work on reader URL fields.
 */
export function isTypingInField(el) {
  if (!el || el === document.body) return false
  const tag = el.tagName
  if (tag === 'TEXTAREA') return true
  if (tag === 'SELECT') return true
  if (tag === 'INPUT') {
    const type = (el.type || '').toLowerCase()
    if (
      type === 'button' ||
      type === 'checkbox' ||
      type === 'radio' ||
      type === 'submit' ||
      type === 'reset' ||
      type === 'file' ||
      type === 'range' ||
      type === 'color'
    ) {
      return false
    }
    if (el.readOnly) return false
    return true
  }
  if (el.isContentEditable) return true
  return false
}

export function isPlusKey(e) {
  return e.key === '+' || e.key === '=' || e.code === 'NumpadAdd'
}

export function isMinusKey(e) {
  return e.key === '-' || e.key === '−' || e.code === 'NumpadSubtract'
}
