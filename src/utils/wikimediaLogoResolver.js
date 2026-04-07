/**
 * Last-resort outlet logo via Wikimedia Commons API (server-backed).
 * Example: "Montreal Gazette" → File:Montreal gazette logo.svg on Commons
 * (https://commons.wikimedia.org/wiki/File:Montreal_gazette_logo.svg).
 */

import { apiUrl } from './apiBase'

export async function resolveLogoViaWikimediaCommons(sourceName) {
  if (!sourceName || !String(sourceName).trim()) return ''
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 12000)
    const response = await fetch(
      apiUrl(`/api/wikimedia/logo?source=${encodeURIComponent(String(sourceName).trim())}`),
      {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      }
    )
    clearTimeout(timeoutId)
    if (!response.ok) return ''
    const data = await response.json()
    const url = data?.url
    if (typeof url === 'string' && url.startsWith('https://upload.wikimedia.org/')) {
      return url
    }
    return ''
  } catch {
    return ''
  }
}
