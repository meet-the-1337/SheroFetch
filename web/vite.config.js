import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

const page = (p) => fileURLToPath(new URL(p, import.meta.url))

// Serves the Vercel functions in /api during `vite dev`, so local runs match production.
function localApi() {
  return {
    name: 'sherofetch-local-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, 'http://local')
        if (url.pathname === '/app' || url.pathname.startsWith('/app/')) { req.url = '/app.html'; return next() }
        if (url.pathname === '/control' || url.pathname.startsWith('/control/')) { req.url = '/control.html'; return next() }
        const m = url.pathname.match(/^\/api\/([a-z]+)$/)
        if (!m) return next()
        try {
          const mod = await server.ssrLoadModule(`/api/${m[1]}.js`)
          req.query = Object.fromEntries(url.searchParams)
          res.status = (code) => { res.statusCode = code; return res }
          res.json = (body) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(body)) }
          res.send = (body) => res.end(body)
          await mod.default(req, res)
        } catch (err) {
          res.statusCode = 500
          res.end(String(err))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), localApi()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: {
    target: 'es2022',
    rollupOptions: {
      input: { main: page('./index.html'), app: page('./app.html'), control: page('./control.html') },
    },
  },
})
