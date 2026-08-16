// Historical Bulls rosters and player totals from the same NBA Stats endpoints
// used by NBA.com. They require browser-like headers and do not allow browser
// CORS, so the season-scoped responses are fetched and trimmed server-side.

import { archivedNbaSeason } from './nba-history-archive.js'

const NBA_ORIGIN = 'https://stats.nba.com/stats'
const BULLS_ID = '1610612741'
const REQUEST_TIMEOUT_MS = 18_000

const NBA_HEADERS = {
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  Origin: 'https://www.nba.com',
  Referer: 'https://www.nba.com/',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36',
}

export const nbaSeasonKey = (endingYear) => {
  const end = Number(endingYear)
  if (!Number.isInteger(end)) return null
  return `${end - 1}-${String(end).slice(-2)}`
}

export function resultRows(payload, name) {
  const sets = payload?.resultSets ?? (payload?.resultSet ? [payload.resultSet] : [])
  const set = sets.find((candidate) => candidate?.name === name)
  if (!set?.headers || !Array.isArray(set.rowSet)) return []
  return set.rowSet.map((row) =>
    Object.fromEntries(set.headers.map((header, index) => [header, row[index] ?? null])),
  )
}

async function nbaRequest(path, params) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const url = `${NBA_ORIGIN}/${path}?${new URLSearchParams(params)}`
    const response = await fetch(url, { headers: NBA_HEADERS, signal: controller.signal })
    if (!response.ok) throw new Error(`NBA Stats responded ${response.status}`)
    return response.json()
  } finally {
    clearTimeout(timeout)
  }
}

export default async function handler(req, res) {
  const { searchParams } = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`)
  const endingYear = searchParams.get('season')
  const mode = searchParams.get('mode')
  const season = nbaSeasonKey(endingYear)

  if (!/^\d{4}$/.test(endingYear ?? '') || !['roster', 'stats'].includes(mode ?? '')) {
    res.statusCode = 400
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ error: 'season (4 digits) and mode (roster or stats) required' }))
  }

  // Landmark seasons live in the repository so a cold serverless function is
  // never forced to wait on stats.nba.com. Other seasons still use the league
  // feed and can be added to the archive without changing this endpoint.
  const archived = archivedNbaSeason(endingYear, mode)
  if (archived) {
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'public, s-maxage=31536000, immutable')
    return res.end(JSON.stringify(archived))
  }

  try {
    if (mode === 'roster') {
      const payload = await nbaRequest('commonteamroster', {
        LeagueID: '00',
        Season: season,
        TeamID: BULLS_ID,
      })
      const roster = resultRows(payload, 'CommonTeamRoster')
      const coaches = resultRows(payload, 'Coaches')
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800')
      return res.end(JSON.stringify({ season, teamId: BULLS_ID, roster, coaches }))
    }

    // One team-scoped request is faster and more reliable than a separate
    // career request for every roster member, and it returns the full stat line.
    const payload = await nbaRequest('leaguedashplayerstats', {
      LeagueID: '00',
      PerMode: 'PerGame',
      Season: season,
      SeasonType: 'Regular Season',
      TeamID: BULLS_ID,
      MeasureType: 'Base',
      Month: 0,
      LastNGames: 0,
      OpponentTeamID: 0,
      PaceAdjust: 'N',
      PlusMinus: 'N',
      Rank: 'N',
    })
    const players = resultRows(payload, 'LeagueDashPlayerStats')
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800')
    return res.end(JSON.stringify({ season, teamId: BULLS_ID, players, unavailable: 0, perMode: 'PerGame' }))
  } catch (error) {
    console.error('[api/nba-history] upstream failure', { endingYear, mode, error: String(error?.message ?? error) })
    const timedOut = error?.name === 'AbortError'
    res.statusCode = timedOut ? 504 : 502
    res.setHeader('Content-Type', 'application/json')
    return res.end(
      JSON.stringify({ error: timedOut ? 'NBA Stats request timed out' : String(error?.message ?? error) }),
    )
  }
}

export const config = { maxDuration: 30 }
