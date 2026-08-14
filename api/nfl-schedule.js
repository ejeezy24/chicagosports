// ESPN's team schedule is incomplete for many older NFL seasons (the 1985
// Bears response starts at Week 9 and reports the Miami loss as a 0-0 tie).
// FiveThirtyEight's open NFL Elo archive has one verified row per game back to
// 1920, so historical regular-season and playoff schedules use it instead.

import { parseCsv } from '../src/players.js'

const SOURCE = 'https://raw.githubusercontent.com/fivethirtyeight/nfl-elo-game/refs/heads/master/data/nfl_games.csv'

const NAMES = {
  ARI: 'Arizona Cardinals', ATL: 'Atlanta Falcons', BAL: 'Baltimore Ravens', BUF: 'Buffalo Bills',
  CAR: 'Carolina Panthers', CHI: 'Chicago Bears', CIN: 'Cincinnati Bengals', CLE: 'Cleveland Browns',
  DAL: 'Dallas Cowboys', DEN: 'Denver Broncos', DET: 'Detroit Lions', GB: 'Green Bay Packers',
  HOU: 'Houston Texans', IND: 'Indianapolis Colts', JAX: 'Jacksonville Jaguars', KC: 'Kansas City Chiefs',
  LAC: 'Los Angeles Chargers', LAR: 'Los Angeles Rams', LV: 'Las Vegas Raiders', MIA: 'Miami Dolphins',
  MIN: 'Minnesota Vikings', NE: 'New England Patriots', NO: 'New Orleans Saints', NYG: 'New York Giants',
  NYJ: 'New York Jets', OAK: 'Oakland Raiders', PHI: 'Philadelphia Eagles', PIT: 'Pittsburgh Steelers',
  SEA: 'Seattle Seahawks', SF: 'San Francisco 49ers', TB: 'Tampa Bay Buccaneers', TEN: 'Tennessee Titans',
  WSH: 'Washington',
}

function historicalName(abbr, season) {
  if (abbr === 'LAC' && season < 2017) return 'San Diego Chargers'
  if (abbr === 'LAR' && season >= 1995 && season <= 2015) return 'St. Louis Rams'
  if (abbr === 'OAK' && season >= 1982 && season <= 1994) return 'Los Angeles Raiders'
  if (abbr === 'TEN' && season < 1997) return 'Houston Oilers'
  if (abbr === 'TEN' && season < 1999) return 'Tennessee Oilers'
  if (abbr === 'ARI' && season < 1988) return 'St. Louis Cardinals'
  if (abbr === 'ARI' && season < 1994) return 'Phoenix Cardinals'
  if (abbr === 'IND' && season < 1984) return 'Baltimore Colts'
  return NAMES[abbr] ?? abbr
}

function gameFromRow(row, team, season) {
  const home = row.team1 === team
  const opponentAbbr = home ? row.team2 : row.team1
  const ourScore = home ? row.score1 : row.score2
  const theirScore = home ? row.score2 : row.score1
  const ours = Number(ourScore)
  const theirs = Number(theirScore)
  const result = ours > theirs ? 'W' : ours < theirs ? 'L' : 'T'

  return {
    id: `538-${season}-${row.date}-${row.team1}-${row.team2}`,
    // Noon UTC keeps a date-only archive row on the correct Chicago calendar day.
    date: `${row.date}T12:00:00Z`,
    week: null,
    home,
    neutral: row.neutral === '1',
    usId: team,
    opponent: { id: opponentAbbr, name: historicalName(opponentAbbr, season), fullName: historicalName(opponentAbbr, season), abbr: opponentAbbr, logo: null },
    ourScore,
    theirScore,
    result,
    state: 'post',
    completed: true,
    hasBoxscore: false,
    detail: 'Final',
    venue: null,
    venueCity: null,
    broadcast: null,
    note: row.playoff === '1' ? 'Postseason' : null,
    record: null,
  }
}

export default async function handler(req, res) {
  const { searchParams } = new URL(req.url, `http://${req.headers.host ?? 'localhost'}`)
  const season = Number(searchParams.get('season'))
  const team = searchParams.get('team')
  const seasonType = Number(searchParams.get('seasonType') ?? 2)

  if (!Number.isInteger(season) || season < 1920 || season > 2021 || !/^[A-Z]{2,3}$/.test(team ?? '') || ![2, 3].includes(seasonType)) {
    res.statusCode = 400
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ error: 'valid season, team and regular/postseason type required' }))
  }

  try {
    const upstream = await fetch(SOURCE, { redirect: 'follow' })
    if (!upstream.ok) throw new Error(`FiveThirtyEight archive responded ${upstream.status}`)
    const csv = await upstream.text()
    const playoff = seasonType === 3 ? '1' : '0'
    const games = parseCsv(csv, (row) => Number(row.season) === season && row.playoff === playoff && (row.team1 === team || row.team2 === team))
      .map((row) => gameFromRow(row, team, season))
      .sort((a, b) => a.date.localeCompare(b.date))

    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800')
    return res.end(JSON.stringify({ season, team, seasonType, source: 'FiveThirtyEight NFL game archive', sourceUrl: 'https://github.com/fivethirtyeight/nfl-elo-game', games }))
  } catch (error) {
    res.statusCode = 502
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ error: String(error?.message ?? error) }))
  }
}
