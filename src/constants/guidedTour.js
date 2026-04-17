/**
 * Per step: `data-tour` names. Each name is measured separately (union only if multiple nodes share the same name).
 * Multiple names ⇒ multiple spotlight holes (no one huge bounding box across unrelated regions).
 */
export const GUIDED_TOUR_STEP_TARGET_LISTS = [
  ['tour-tabs'],
  ['tour-layout'],
  ['tour-filters', 'tour-filters-strip'],
  ['tour-saved'],
  // Only the ? control — dropdown sits above the dim via .header-help-dropdown--tour-spotlight
  ['tour-help'],
  ['tour-settings'],
  ['tour-settings-tabbar', 'tour-settings-active-panel'],
  // One step: button + dialog (modal opens via Settings useLayoutEffect before overlay measures)
  ['tour-manual-feed-btn', 'tour-manual-dialog'],
  ['tour-browse'],
  ['tour-export-import'],
  ['tour-reader-toggle'],
  ['tour-settings-back'],
]

export const GUIDED_TOUR_STEP_COUNT = GUIDED_TOUR_STEP_TARGET_LISTS.length
