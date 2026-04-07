/**
 * Builds the full URL for Actufeed API routes.
 *
 * 1. `VITE_API_BASE` in `.env` if set (e.g. `http://10.0.0.53:3073`) — full override.
 * 2. Dev + UI opened on a **non-loopback** host (e.g. `http://10.0.0.53:3072`): use the same
 *    hostname with `VITE_BACKEND_PORT` (default 3073). Vite’s proxy only forwards server-side
 *    to 127.0.0.1; that path is easy to break (port tunnels, another process on loopback). Calling
 *    `http://<same-host>:3073/api/...` from the browser hits Express directly; CORS allows LAN
 *    dev origins in server.js.
 * 3. Otherwise relative `/api/...` (same origin, Vite proxy on localhost).
 *
 * @param {string} path Absolute API path starting with `/api/`
 * @returns {string}
 */
export function apiUrl(path) {
  const p = path.startsWith('/') ? path : `/${path}`
  const raw = import.meta.env.VITE_API_BASE
  const explicit = typeof raw === 'string' ? raw.trim().replace(/\/$/, '') : ''
  if (explicit) return `${explicit}${p}`

  if (import.meta.env.DEV && typeof window !== 'undefined') {
    const { hostname, protocol } = window.location
    const backendPort = Number(import.meta.env.VITE_BACKEND_PORT || 3073)
    const loopback = hostname === 'localhost' || hostname === '127.0.0.1'
    if (!loopback && protocol.startsWith('http') && Number.isFinite(backendPort)) {
      return `${protocol}//${hostname}:${backendPort}${p}`
    }
  }

  return p
}
