// Thin client for ESPN's public (undocumented) endpoints.
//
// Every request goes to a same-origin prefix first — proxied by vite.config.js
// in dev and vercel.json in production — so CORS never enters the picture. If
// that prefix isn't wired up (plain static hosting, a stray 404, an HTML
// fallback served in place of JSON), we retry the same path directly against
// ESPN, which does send permissive CORS headers.

import { currentSeasonFor } from './seasons.js'

const HOSTS = {
  site: { prefix: '/espn', direct: 'https://site.api.espn.com' },
  web: { prefix: '/espnweb', direct: 'https://site.web.api.espn.com' },
  core: { prefix: '/espncore', direct: 'https://sports.core.api.espn.com' },
  // Not ESPN: the leagues' own APIs, for the past seasons ESPN doesn't serve.
  // See players.js for why.
  mlb: { prefix: '/mlbstats', direct: 'https://statsapi.mlb.com' },
  nhl: { prefix: '/nhlweb', direct: 'https://api-web.nhle.com' },
  // Our own serverless functions rather than an upstream — nflverse release
  // redirects and NBA Stats' headers/CORS have to be handled server-side.
  own: { prefix: '', direct: '', proxyOnly: true },
}

/** The NHL keys a season by both of its years: 2015 -> '20142015'. */
const nhlSeason = (season) => `${Number(season) - 1}${Number(season)}`

export class ApiError extends Error {
  constructor(message, { status, url, cause } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.url = url
    this.cause = cause
  }
}

function buildQuery(params) {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v === undefined || v === null || v === '') continue
    qs.set(k, String(v))
  }
  const s = qs.toString()
  return s ? `?${s}` : ''
}

const REQUEST_TIMEOUT_MS = 12_000
const RETRY_DELAY_MS = 400
const CACHE_TTL_MS = 15 * 60_000
const CACHE_MAX_ENTRIES = 64

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const isRetryable = (error) =>
  error?.status === 408 || error?.status === 429 || error?.status >= 500 || !error?.status

async function fetchBody(url, { text: wantText = false, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  let res
  try {
    res = await fetch(url, {
      headers: { Accept: wantText ? 'text/csv, text/plain, */*' : 'application/json' },
      signal: controller.signal,
    })
  } catch (cause) {
    const message = controller.signal.aborted ? 'Request timed out' : 'Network request failed'
    throw new ApiError(message, { url, cause })
  } finally {
    clearTimeout(timeout)
  }
  if (!res.ok) {
    throw new ApiError(`Upstream responded ${res.status}`, { status: res.status, url })
  }

  const body = await res.text()
  // One source ships CSV rather than JSON; the caller says which it wants.
  if (wantText) {
    if (!body) throw new ApiError('Empty response', { url })
    return body
  }

  try {
    return JSON.parse(body)
  } catch {
    // Static hosts answer unknown paths with index.html; treat that as a miss
    // so the caller can fall back to the direct origin.
    throw new ApiError('Expected JSON but got something else', { url })
  }
}

async function fetchWithRetry(url, options) {
  try {
    return await fetchBody(url, options)
  } catch (firstError) {
    if (!isRetryable(firstError)) throw firstError
    await pause(RETRY_DELAY_MS)
    return fetchBody(url, options)
  }
}

// Keep recently visited seasons around, but bound the cache: fans can browse
// decades of schedules in one session and a cache that only grows eventually
// becomes its own performance problem.
const cache = new Map()

function cached(key) {
  const entry = cache.get(key)
  if (!entry) return null
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key)
    return null
  }
  // Refresh insertion order so eviction is least-recently-used.
  cache.delete(key)
  cache.set(key, entry)
  return entry.pending
}

function remember(key, pending) {
  cache.set(key, { pending, expiresAt: Date.now() + CACHE_TTL_MS })
  while (cache.size > CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value)
}

async function request(hostKey, path, params, options = {}) {
  const host = HOSTS[hostKey]
  const url = path + buildQuery(params)
  const key = `${hostKey}:${url}`
  // A live score is the one thing here that isn't immutable, so polling asks to
  // go past the cache rather than being served the payload it already has.
  if (!options.fresh) {
    const hit = cached(key)
    if (hit) return hit
  }

  const pending = (async () => {
    try {
      return await fetchWithRetry(host.prefix + url, options)
    } catch (proxyError) {
      // Some sources are only reachable through the proxy — nflverse redirects
      // to a host that sends no CORS headers — so there is nothing to retry.
      if (host.proxyOnly) throw proxyError
      // Any failure here is worth a second opinion: a 404 can mean the rewrite
      // isn't configured rather than "no such season", and a 502/504 means the
      // proxy itself couldn't reach ESPN — the case where going direct helps
      // most. The direct attempt is authoritative, so its error is the one
      // worth surfacing, but keep the proxy's around for debugging.
      try {
        return await fetchWithRetry(host.direct + url, options)
      } catch (directError) {
        directError.proxyError = proxyError
        throw directError
      }
    }
  })()

  remember(key, pending)
  // Don't cache failures — but only evict this attempt. Without the identity
  // check a failed refresh would throw away a newer, good payload that other
  // panels are already awaiting. Unreachable before polling existed.
  pending.catch(() => {
    if (cache.get(key)?.pending === pending) cache.delete(key)
  })
  return pending
}

const leaguePath = (team) => `/apis/site/v2/sports/${team.sport}/${team.league}`

/** Team profile: logo, colours, current record, next game. */
export function getTeam(team, { fresh } = {}) {
  return request('site', `${leaguePath(team)}/teams/${team.espnId}`, undefined, { fresh })
}

/**
 * Today's games across a league, with live scores.
 *
 * The schedule and team endpoints leave the score off entirely while a game is
 * in progress — they carry only the probable pitchers — so this is the only
 * place a running score can be read. One request covers every game in the
 * league, which is cheaper than a summary per game.
 */
export function getScoreboard(team, { fresh } = {}) {
  return request('site', `${leaguePath(team)}/scoreboard`, undefined, { fresh })
}

/** Every game for one season and season type (1 pre, 2 regular, 3 post). */
export function getSchedule(team, season, seasonType = 2, { fresh } = {}) {
  return request(
    'site',
    `${leaguePath(team)}/teams/${team.espnId}/schedule`,
    { season, seasontype: seasonType },
    { fresh },
  )
}

/**
 * Roster. ESPN honours `season` for some leagues and quietly returns the
 * current roster for others — the response echoes back which season it actually
 * gave us, and the UI surfaces that rather than pretending.
 */
export function getRoster(team, season) {
  // ESPN answers 200 with no athletes for any past season, so baseball history
  // comes from MLB instead. The current roster still comes from ESPN, which
  // carries college and headshots that StatsAPI doesn't.
  if (isHistorical(team, season)) {
    if (team.sport === 'baseball') {
      return request('mlb', `/api/v1/teams/${team.mlbId}/roster`, {
        rosterType: 'fullSeason',
        season,
        hydrate: 'person',
      })
    }
    if (team.sport === 'hockey') {
      return request('nhl', `/v1/roster/${team.abbr}/${nhlSeason(season)}`)
    }
    if (team.sport === 'football') {
      // Trimmed to this club before it leaves the server; see api/nfl-roster.js.
      return request('own', '/api/nfl-roster', { season, team: team.abbr })
    }
    if (team.sport === 'basketball') {
      return request('own', '/api/nba-history', { season, mode: 'roster' })
    }
  }

  return request('site', `${leaguePath(team)}/teams/${team.espnId}/roster`, { season })
}

/** True for any season that has already finished. */
export const isHistorical = (team, season) =>
  Number(season) !== Number(currentSeasonFor(team))

/**
 * Season team statistics (totals, per-game, league ranks).
 *
 * The `site.web.api` `/apis/common/v3/…/teams/{id}/statistics` path this used to
 * call now answers 404 for every league. The core API carries the same numbers,
 * but keys the season type in the path rather than a query parameter.
 */
export function getTeamStats(team, season, seasonType = 2) {
  return request(
    'core',
    `/v2/sports/${team.sport}/leagues/${team.league}/seasons/${season}/types/${seasonType}/teams/${team.espnId}/statistics`,
  )
}

/**
 * One game in full: line score by inning/quarter/period, team statistics, and
 * the attendance-and-officials footer. Same endpoint for every league, though
 * the shape inside differs — see `boxscore()` in espn.js.
 */
export function getSummary(team, eventId) {
  return request('site', `${leaguePath(team)}/summary`, { event: eventId })
}

/**
 * Season statistics for every player on the roster.
 *
 * Finished seasons use league/archive sources where ESPN ignores its season
 * parameter: MLB StatsAPI, NBA Stats, the NHL, and nflverse. Current non-MLB
 * seasons still use ESPN's roster endpoint, which carries player splits.
 */
export function getPlayerStats(team, season) {
  // Hockey's own API is season-scoped; ESPN's isn't, so use it for past years.
  // `2` is the regular season.
  if (team.sport === 'hockey' && isHistorical(team, season)) {
    return request('nhl', `/v1/club-stats/${team.abbr}/${nhlSeason(season)}/2`)
  }

  if (team.sport === 'baseball') {
    return request('mlb', `/api/v1/teams/${team.mlbId}/roster`, {
      // A finished season wants everyone who appeared, not today's 26.
      rosterType: isHistorical(team, season) ? 'fullSeason' : 'active',
      season,
      // One request instead of one per player.
      hydrate: `person(stats(type=season,season=${season},gameType=R))`,
    })
  }

  if (team.sport === 'football' && isHistorical(team, season)) {
    if (Number(season) < 1999) {
      return Promise.resolve({ season: Number(season), team: team.abbr, players: [], availableFrom: 1999 })
    }
    return request('own', '/api/nfl-player-stats', { season, team: team.abbr })
  }

  if (team.sport === 'basketball' && isHistorical(team, season)) {
    return request('own', '/api/nba-history', { season, mode: 'stats' })
  }

  return request('web', `/apis/common/v3/sports/${team.sport}/${team.league}/teams/${team.espnId}/roster`, {
    season,
  })
}

/** League standings for a season, division level. */
export function getStandings(team, season) {
  return request('site', `/apis/v2/sports/${team.sport}/${team.league}/standings`, {
    season,
    level: 3,
  })
}
