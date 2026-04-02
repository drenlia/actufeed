/**
 * YouTube channel search via Actufeed backend (`/api/youtube/channel-search`).
 * The YouTube API key stays on the server (same as the mobile app).
 */

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

  const url = `/api/youtube/channel-search?${new URLSearchParams({ q })}`
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  })
  let json = {}
  try {
    json = await res.json()
  } catch {
    json = {}
  }

  if (res.status === 503) {
    throw new Error(YOUTUBE_SEARCH_UNAVAILABLE)
  }
  if (!res.ok) {
    throw new Error(json.error || `HTTP ${res.status}`)
  }
  return { items: Array.isArray(json.items) ? json.items : [] }
}
