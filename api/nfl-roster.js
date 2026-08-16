// nflverse publishes rosters as GitHub release assets, which redirect to a
// signed URL on a host that sends no CORS headers. A plain rewrite doesn't work:
// Vercel hands the 302 back to the browser, which then can't follow it. The
// redirect has to be followed somewhere with no same-origin policy, so it
// happens here.
//
// Doing it in a function rather than a rewrite also means the league-wide file
// can be cut down to one club before it crosses the network — roughly 673 kB
// becomes a few kB.

import { parseCsv } from '../src/players.js'

const SOURCE = 'https://github.com/nflverse/nflverse-data/releases/download/rosters'

// The file carries 36 columns, most of them cross-reference ids for other data
// providers. Send only what the roster view reads.
const KEEP = [
  'team',
  'position',
  'depth_chart_position',
  'jersey_number',
  'full_name',
  'first_name',
  'last_name',
  'birth_date',
  'height',
  'weight',
  'college',
  'headshot_url',
  'status',
  'gsis_id',
  'esb_id',
]

const project = (row) => Object.fromEntries(KEEP.map((k) => [k, row[k] ?? '']))

export default async function handler(req, res) {
  const { searchParams } = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`)
  const season = searchParams.get('season')
  const team = searchParams.get('team')

  if (!/^\d{4}$/.test(season ?? '') || !/^[A-Z]{2,3}$/.test(team ?? '')) {
    res.statusCode = 400
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ error: 'season (4 digits) and team (abbreviation) required' }))
  }

  try {
    const upstream = await fetch(`${SOURCE}/roster_${season}.csv`, { redirect: 'follow' })
    if (!upstream.ok) {
      res.statusCode = upstream.status === 404 ? 404 : 502
      res.setHeader('Content-Type', 'application/json')
      return res.end(JSON.stringify({ error: `nflverse responded ${upstream.status}` }))
    }

    const csv = await upstream.text()
    const rows = parseCsv(csv, (r) => r.team === team).map(project)

    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    // A finished season never changes, so let the edge hold it for a day.
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800')
    return res.end(JSON.stringify({ season: Number(season), team, players: rows }))
  } catch (err) {
    console.error('[api/nfl-roster] upstream failure', { season, team, error: String(err?.message ?? err) })
    res.statusCode = 502
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ error: String(err?.message ?? err) }))
  }
}
