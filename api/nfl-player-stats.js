// nflverse publishes one league-wide CSV per season. Fetch it server-side so
// the browser never has to follow GitHub's cross-origin release redirect, then
// return only the Bears rows and the columns the tables actually render.

import { parseCsv } from '../src/players.js'

const SOURCE =
  'https://github.com/nflverse/nflverse-data/releases/download/stats_player'

const KEEP = [
  'player_id',
  'player_name',
  'player_display_name',
  'position',
  'position_group',
  'headshot_url',
  'season',
  'season_type',
  'recent_team',
  'games',
  'completions',
  'attempts',
  'passing_yards',
  'passing_tds',
  'passing_interceptions',
  'carries',
  'rushing_yards',
  'rushing_tds',
  'receptions',
  'targets',
  'receiving_yards',
  'receiving_tds',
  'def_tackles_solo',
  'def_tackle_assists',
  'def_tackles_for_loss',
  'def_sacks',
  'def_interceptions',
  'def_pass_defended',
  'def_tds',
  'special_teams_tds',
  'fg_made',
  'fg_att',
  'fg_pct',
  'pat_made',
  'pat_att',
  'pt_att',
  'pt_yards',
  'pt_long',
]

const project = (row) => Object.fromEntries(KEEP.map((key) => [key, row[key] ?? '']))

export default async function handler(req, res) {
  const { searchParams } = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`)
  const season = searchParams.get('season')
  const team = searchParams.get('team')

  if (!/^\d{4}$/.test(season ?? '') || !/^[A-Z]{2,3}$/.test(team ?? '')) {
    res.statusCode = 400
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ error: 'season (4 digits) and team (abbreviation) required' }))
  }

  if (Number(season) < 1999) {
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800')
    return res.end(JSON.stringify({ season: Number(season), team, players: [], availableFrom: 1999 }))
  }

  try {
    const upstream = await fetch(`${SOURCE}/stats_player_reg_${season}.csv`, {
      redirect: 'follow',
    })
    if (!upstream.ok) {
      res.statusCode = upstream.status === 404 ? 404 : 502
      res.setHeader('Content-Type', 'application/json')
      return res.end(JSON.stringify({ error: `nflverse responded ${upstream.status}` }))
    }

    const csv = await upstream.text()
    const players = parseCsv(csv, (row) => row.recent_team === team).map(project)

    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800')
    return res.end(JSON.stringify({ season: Number(season), team, players, availableFrom: 1999 }))
  } catch (error) {
    console.error('[api/nfl-player-stats] upstream failure', { season, team, error: String(error?.message ?? error) })
    res.statusCode = 502
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ error: String(error?.message ?? error) }))
  }
}
