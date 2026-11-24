import { defineConfig, loadEnv } from 'vite'
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

// device.json: the public project address and publishable key, read by the device installer so a
// person's own PC or phone can join without typing them. Both are already public in the page.
function deviceJson(env) {
  return {
    name: 'sherofetch-device-json',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'device.json', source: JSON.stringify({ url: env.VITE_SUPABASE_URL, key: env.VITE_SUPABASE_KEY }) })
    },
  }
}

// `vite build --mode native` builds only the app page into the Android project, where it is served
// from the phone itself, so the APK opens with no signal. build:native then renames it index.html.
export default defineConfig(({ mode }) => {
  const native = mode === 'native'
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
    plugins: [react(), localApi(), ...(native ? [] : [deviceJson(env)])],
    // the site's public folder holds the APK itself and landing art; the app needs none of it
    publicDir: native ? false : 'public',
    server: { host: '127.0.0.1', port: 5173, strictPort: true },
    build: {
      target: 'es2022',
      outDir: native ? page('../tauri-music-downloader/dist') : 'dist',
      emptyOutDir: true,
      rollupOptions: {
        input: native ? { app: page('./app.html') } : { main: page('./index.html'), app: page('./app.html'), control: page('./control.html') },
      },
    },
  }
})
