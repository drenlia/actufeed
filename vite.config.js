import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const vitePort = Number(env.VITE_PORT || 3072)
  const backendPort = Number(env.BACKEND_PORT || 3073)
  /** Dev-only: where Vite forwards `/api` (browser never sees this). Prefer 127.0.0.1 over localhost to avoid ::1 vs IPv4 listen mismatches. */
  const backendProxyTarget =
    (env.BACKEND_PROXY_TARGET && env.BACKEND_PROXY_TARGET.trim()) ||
    `http://127.0.0.1:${backendPort}`
  const allowedHosts = env.ALLOWED_HOSTS
    ? env.ALLOWED_HOSTS.split(',').map((h) => h.trim()).filter(Boolean)
    : env.HOST
      ? [env.HOST]
      : undefined

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: vitePort,
      allowedHosts, // undefined = all hosts allowed (e.g. behind trusted proxy)
      // Proxy API requests to backend server during development
      proxy: {
        '/api': {
          target: backendProxyTarget,
          changeOrigin: true,
          configure(proxy) {
            proxy.on('error', (err, _req, res) => {
              console.error('[vite proxy /api]', err.message, '| target:', backendProxyTarget)
              if (res && !res.headersSent) {
                res.writeHead(502, { 'Content-Type': 'text/plain' })
                res.end('Bad gateway (API proxy)')
              }
            })
            proxy.on('proxyRes', (proxyRes, req) => {
              const ct = (proxyRes.headers['content-type'] || '').toLowerCase()
              if (ct.includes('text/html') && req.url?.includes('youtube')) {
                console.warn(
                  '[vite proxy /api] YouTube route returned HTML — upstream is not the JSON API. target:',
                  backendProxyTarget,
                  'path:',
                  req.url
                )
              }
            })
          },
        },
      },
    },
    preview: {
      host: '0.0.0.0',
      port: vitePort,
      allowedHosts,
    },
  }
})
