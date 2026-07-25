import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// ESPN's public endpoints are called through same-origin prefixes so the browser
// never has to care about CORS. `vite dev` and `vite preview` proxy them here;
// vercel.json does the same rewrites for a deployed build. If neither is in
// play (plain static hosting), src/api.js falls back to calling ESPN directly.
const espnProxy = (target, prefix) => ({
  target,
  changeOrigin: true,
  secure: true,
  rewrite: (p) => p.replace(new RegExp(`^${prefix}`), ''),
  headers: {
    // ESPN serves these endpoints without auth, but a browser-ish UA avoids
    // edge cases where the CDN answers server-to-server requests differently.
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
  },
})

// Longest prefixes first — Vite matches with startsWith, so `/espn` would
// otherwise swallow `/espnweb` and `/espncore`.
const proxy = {
  '/espnweb': espnProxy('https://site.web.api.espn.com', '/espnweb'),
  '/espncore': espnProxy('https://sports.core.api.espn.com', '/espncore'),
  '/espn': espnProxy('https://site.api.espn.com', '/espn'),
}

export default defineConfig({
  plugins: [react()],
  server: { proxy },
  preview: { proxy },
})
