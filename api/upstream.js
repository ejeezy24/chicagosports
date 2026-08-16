import https from 'node:https'

const ORIGINS = {
  site: 'https://site.api.espn.com',
  web: 'https://site.web.api.espn.com',
  core: 'https://sports.core.api.espn.com',
  mlb: 'https://statsapi.mlb.com',
  nhl: 'https://api-web.nhle.com',
}
const MAX_BYTES = 5 * 1024 * 1024
const TIMEOUT_MS = 15_000

export function upstreamUrl(source, path, params = new URLSearchParams()) {
  const origin = ORIGINS[source]
  if (!origin || !path || path.includes('..') || path.includes('://') || path.includes('\\') || !/^[A-Za-z0-9/_.-]+$/.test(path)) return null
  const query = new URLSearchParams(params)
  query.delete('source')
  query.delete('path')
  const suffix = query.toString()
  return `${origin}/${path.replace(/^\/+/, '')}${suffix ? `?${suffix}` : ''}`
}

function getBody(url) {
  return new Promise((resolve, reject) => {
    // ESPN currently denies browser and Node agents but accepts the same public
    // endpoint from a plain command-line client. Use that minimal agent here;
    // no cookies, origin, referer, or credentials are forwarded.
    const request = https.get(url, { headers: { Accept: 'application/json', 'User-Agent': 'curl/8.0.1' } }, (response) => {
      const chunks = []
      let size = 0
      response.on('data', (chunk) => {
        size += chunk.length
        if (size > MAX_BYTES) {
          request.destroy(new Error('Upstream response exceeded size limit'))
          return
        }
        chunks.push(chunk)
      })
      response.on('end', () => resolve({
        status: response.statusCode ?? 502,
        contentType: response.headers['content-type'] ?? 'application/json',
        body: Buffer.concat(chunks),
      }))
    })
    request.setTimeout(TIMEOUT_MS, () => request.destroy(new Error('Upstream request timed out')))
    request.on('error', reject)
  })
}

export default async function handler(req, res) {
  const incoming = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`)
  const url = upstreamUrl(incoming.searchParams.get('source'), incoming.searchParams.get('path'), incoming.searchParams)
  if (!url) {
    res.statusCode = 400
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ error: 'Invalid upstream source or path' }))
  }

  try {
    const response = await getBody(url)
    res.statusCode = response.status
    res.setHeader('Content-Type', response.contentType)
    res.setHeader(
      'Cache-Control',
      response.status >= 200 && response.status < 300
        ? 'public, s-maxage=300, stale-while-revalidate=900'
        : 'no-store',
    )
    return res.end(response.body)
  } catch (error) {
    console.error('[api/upstream] request failed', { source: incoming.searchParams.get('source'), error: String(error?.message ?? error) })
    res.statusCode = String(error?.message).includes('timed out') ? 504 : 502
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ error: 'Upstream request failed' }))
  }
}

export const config = { maxDuration: 20 }
