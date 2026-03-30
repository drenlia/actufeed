import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const vitePort = Number(env.VITE_PORT || 3072)
  const backendPort = Number(env.BACKEND_PORT || 3073)
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
          target: `http://localhost:${backendPort}`,
          changeOrigin: true,
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
