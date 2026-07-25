// Thin client for ESPN's public (undocumented) endpoints.
//
// Every request goes to a same-origin prefix first — proxied by vite.config.js
// in dev and vercel.json in production — so CORS never enters the picture. If
// that prefix isn't wired up (plain static hosting, a stray 404, an HTML
// fallback served in place of JSON), we retry the same path directly against
// ESPN, which does send permissive CORS headers.

const HOSTS = {
  site: { prefix: '/espn', direct: 'https://site.api.espn.com' },
  web: { prefix: '/espnweb', direct: 'https://site.web.api.espn.com' },
  core: { prefix: '/espncore', direct: 'https://sports.core.api.espn.com' },
}

export class ApiError extends Error {
  constructor(message, { status, url, cause } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.url = url
    this.cause = cause
  }
}

function buildQuery(params = {}) {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue
    qs.set(k, String(v))
  }
  const s = qs.toString()
  return s ? `?${s}` : ''
}

async function fetchJson(url) {
  let res
  try {
    res = await fetch(url, { headers: { Accept: 'application/json' } })
  } catch (cause) {
    throw new ApiError('Network request failed', { url, cause })
  }
  if (!res.ok) {
    throw new ApiError(`ESPN responded ${res.status}`, { status: res.status, url })
  }
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    // Static hosts answer unknown paths with index.html; treat that as a miss
    // so the caller can fall back to the direct ESPN origin.
    throw new ApiError('Expected JSON but got something else', { url })
  }
}

// Responses are immutable for a given season, and several panels ask for the
// same team payload, so keep the in-flight promise around for the page session.
const cache = new Map()

async function request(hostKey, path, params) {
  const host = HOSTS[hostKey]
  const url = path + buildQuery(params)
  const key = `${hostKey}:${url}`
  if (cache.has(key)) return cache.get(key)

  const pending = (async () => {
    try {
      return await fetchJson(host.prefix + url)
    } catch (err) {
      if (err instanceof ApiError && err.status && err.status >= 500) throw err
      return await fetchJson(host.direct + url)
    }
  })()

  cache.set(key, pending)
  pending.catch(() => cache.delete(key)) // don't cache failures
  return pending
}

const leaguePath = (team) => `/apis/site/v2/sports/${team.sport}/${team.league}`

/** Team profile: logo, colours, current record, next game. */
export function getTeam(team) {
  return request('site', `${leaguePath(team)}/teams/${team.espnId}`)
}

/** Every game for one season and season type (1 pre, 2 regular, 3 post). */
export function getSchedule(team, season, seasonType = 2) {
  return request('site', `${leaguePath(team)}/teams/${team.espnId}/schedule`, {
    season,
    seasontype: seasonType,
  })
}

/**
 * Roster. ESPN honours `season` for some leagues and quietly returns the
 * current roster for others — the response echoes back which season it actually
 * gave us, and the UI surfaces that rather than pretending.
 */
export function getRoster(team, season) {
  return request('site', `${leaguePath(team)}/teams/${team.espnId}/roster`, { season })
}

/** Season team statistics (totals, per-game, league ranks). */
export function getTeamStats(team, season) {
  return request(
    'web',
    `/apis/common/v3/sports/${team.sport}/${team.league}/teams/${team.espnId}/statistics`,
    { season },
  )
}

/** League standings for a season, division level. */
export function getStandings(team, season) {
  return request('site', `/apis/v2/sports/${team.sport}/${team.league}/standings`, {
    season,
    level: 3,
  })
}
