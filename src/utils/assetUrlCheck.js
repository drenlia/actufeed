/**
 * Server-backed check that a URL returns image bytes (favicon / logo probe).
 */

import { apiUrl } from './apiBase'

export async function verifyRemoteImageUrl(url) {
  if (!url || typeof url !== 'string') return false
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 8000)
    const response = await fetch(
      apiUrl(`/api/proxy/asset/check?url=${encodeURIComponent(url)}`),
      {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      }
    )
    clearTimeout(timeoutId)
    if (!response.ok) return false
    const data = await response.json()
    return data.ok === true
  } catch {
    return false
  }
}
