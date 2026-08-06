import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// ESPN's public endpoints are called through same-origin prefixes so the browser
// never has to care about CORS. `vite dev` and `vite preview` proxy them here;
// vercel.json does the same rewrites for a deployed build. If neither is in
// play (plain static hosting), src/api.js falls back to calling ESPN directly.
// No spoofed User-Agent. It used to carry a browser one to avoid the CDN
// answering server-to-server requests differently; that has since inverted —
// site.api.espn.com now returns 403 for exactly that header, while the same
// request with a plain agent succeeds. Production never set it and was
// unaffected, so dev was the only thing broken.
const espnProxy = (target, prefix) => ({
  target,
  changeOrigin: true,
  secure: true,
  rewrite: (p) => p.replace(new RegExp(`^${prefix}`), ''),
})

// Longest prefixes first — Vite matches with startsWith, so `/espn` would
// otherwise swallow `/espnweb` and `/espncore`.
const proxy = {
  '/espnweb': espnProxy('https://site.web.api.espn.com', '/espnweb'),
  '/espncore': espnProxy('https://sports.core.api.espn.com', '/espncore'),
  '/espn': espnProxy('https://site.api.espn.com', '/espn'),
  // The leagues' own APIs, for the past seasons ESPN doesn't serve.
  '/mlbstats': espnProxy('https://statsapi.mlb.com', '/mlbstats'),
  '/nhlweb': espnProxy('https://api-web.nhle.com', '/nhlweb'),
}

/**
 * `api/` holds Vercel serverless functions, which `vite dev` knows nothing
 * about. Running the very same handler as dev middleware keeps the two honest:
 * a rewrite that worked in dev and returned a bare 302 in production is exactly
 * how the NFL roster broke the first time.
 */
function vercelFunctions() {
  const functions = {
    '/api/nfl-roster': '/api/nfl-roster.js',
    '/api/nfl-player-stats': '/api/nfl-player-stats.js',
    '/api/nba-history': '/api/nba-history.js',
  }

  return {
    name: 'vercel-functions-in-dev',
    configureServer(server) {
      for (const [route, modulePath] of Object.entries(functions)) {
        server.middlewares.use(route, async (req, res, next) => {
          try {
            const { default: handler } = await server.ssrLoadModule(modulePath)
            await handler(req, res)
          } catch (err) {
            next(err)
          }
        })
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), vercelFunctions()],
  server: { proxy },
  preview: { proxy },
})
