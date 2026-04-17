const WELCOME_TOUR_KEY = 'actufeed-welcome-tour-v1'

/** @returns {boolean} */
export function isWelcomeTourCompleted() {
  try {
    return localStorage.getItem(WELCOME_TOUR_KEY) === '1'
  } catch {
    return false
  }
}

export function markWelcomeTourCompleted() {
  try {
    localStorage.setItem(WELCOME_TOUR_KEY, '1')
  } catch {
    /* ignore */
  }
}
