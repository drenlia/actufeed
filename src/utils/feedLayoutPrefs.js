/**
 * Feed layout preference + viewport-based defaults for the web app.
 */

/** Below this width, grid is forced to a single column (list-style reading). */
export const FEED_GRID_MIN_VIEWPORT_PX = 640

/** Auto layout: narrow → list, medium → 2 cols, wide → 3 cols. */
export function computeAutoFeedLayout(viewportWidth) {
  const w = typeof viewportWidth === 'number' && viewportWidth > 0 ? viewportWidth : 1200
  if (w < 880) return 'list'
  if (w < 1320) return 'columns2'
  return 'columns3'
}

const LAYOUT_RANK = { list: 0, columns2: 1, columns3: 2 }
const RANK_TO_LAYOUT = ['list', 'columns2', 'columns3']

/**
 * @param {'auto' | 'list' | 'columns2' | 'columns3'} preference
 * @param {number} viewportWidth
 * @returns {'list' | 'columns2' | 'columns3'}
 */
export function resolveFeedLayout(preference, viewportWidth) {
  const w = typeof viewportWidth === 'number' && viewportWidth > 0 ? viewportWidth : 1200
  if (w < FEED_GRID_MIN_VIEWPORT_PX) return 'list'

  const autoLayout = computeAutoFeedLayout(w)
  if (preference === 'auto' || !preference) return autoLayout

  if (preference === 'list' || preference === 'columns2' || preference === 'columns3') {
    // Cap explicit list / 2-col / 3-col by what fits at this width (same bands as auto).
    // Otherwise a saved "3 columns" choice jumps straight to 3 cols as soon as w ≥ 640.
    const autoRank = LAYOUT_RANK[autoLayout]
    const prefRank = LAYOUT_RANK[preference]
    return RANK_TO_LAYOUT[Math.min(prefRank, autoRank)]
  }

  return autoLayout
}

export const FEED_DESC_FONT_SCALE_MIN = 0.75
export const FEED_DESC_FONT_SCALE_MAX = 1.35
export const FEED_DESC_FONT_SCALE_STEP = 0.05

export function clampFeedDescriptionFontScale(n) {
  const x = typeof n === 'number' && !Number.isNaN(n) ? n : 1
  const s = Math.round(x / FEED_DESC_FONT_SCALE_STEP) * FEED_DESC_FONT_SCALE_STEP
  return Math.min(FEED_DESC_FONT_SCALE_MAX, Math.max(FEED_DESC_FONT_SCALE_MIN, s))
}
