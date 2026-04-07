/**
 * YouTube channel search via Actufeed backend (`/api/youtube/channel-search`).
 * The YouTube API key stays on the server (same as the mobile app).
 */

import { apiUrl } from '../utils/apiBase'

export const YOUTUBE_SEARCH_UNAVAILABLE = 'YOUTUBE_SEARCH_UNAVAILABLE'

/** Canonical channel page URL used before Validate (matches mobile). */
export function youtubeChannelPageUrl(channelId) {
  return `https://www.youtube.com/channel/${channelId}`
}

/**
 * @returns {Promise<{ items: Array<{ channelId: string, title: string, description: string, thumbnailUrl: string | null }> }>}
 */
export async function searchYoutubeChannels(query) {
  const q = String(query || '').trim()
  if (!q) return { items: [] }

  const url = apiUrl(`/api/youtube/channel-search?${new URLSearchParams({ q })}`)
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  })
  const text = await res.text()
  const trimmed = text.trim()

  let json = null
  try {
    json = trimmed ? JSON.parse(trimmed) : null
  } catch (parseErr) {
    if (res.ok) {
      const snippet = trimmed.slice(0, 160).replace(/\s+/g, ' ')
      const hint =
        trimmed.startsWith('<') || trimmed.startsWith('<!') || /<\s*html/i.test(trimmed)
          ? 'Received HTML instead of JSON — API request likely hit the SPA, not Express. On LAN dev, open the app via your machine IP (same host as API) or set VITE_API_BASE in .env.'
          : 'Response was not valid JSON.'
      throw new Error(`${hint} ${snippet}${trimmed.length > 160 ? '…' : ''}`)
    }
    json = null
  }

  if (res.status === 503) {
    throw new Error(YOUTUBE_SEARCH_UNAVAILABLE)
  }
  if (!res.ok) {
    const errMsg =
      json && typeof json.error === 'string'
        ? json.error
        : json && json.error && typeof json.error.message === 'string'
          ? json.error.message
          : `HTTP ${res.status}`
    throw new Error(errMsg)
  }

  if (json === null || typeof json !== 'object' || Array.isArray(json)) {
    throw new Error(
      res.ok && !trimmed
        ? 'Empty response from /api/youtube/channel-search (is the API server running and proxied?)'
        : 'Invalid JSON from YouTube search endpoint.'
    )
  }

  if (!Array.isArray(json.items)) {
    const keys = Object.keys(json)
    const errMsg =
      typeof json.error === 'string'
        ? json.error
        : json.error && typeof json.error.message === 'string'
          ? json.error.message
          : keys.length === 0
            ? 'Empty JSON from server — /api/youtube/channel-search may not be hitting Actufeed (check Vite proxy or deploy routing).'
            : `Response has no items array (keys: ${keys.slice(0, 8).join(', ') || 'none'}).`
    throw new Error(errMsg)
  }

  return { items: json.items }
}
