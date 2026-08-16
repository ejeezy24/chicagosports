import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { archivedNbaSeason } from '../api/nba-history-archive.js'
import { nbaSeasonKey, resultRows } from '../api/nba-history.js'
import { parseCsv } from '../src/players.js'
import { seasonLabel } from '../src/seasons.js'
import { SCHEMA_VERSION } from '../src/archiveSnapshots.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
export const ARCHIVE_DIR = join(ROOT, 'public', 'data', 'archive')

const timeoutFetch = async (url, options = {}, attempts = 3) => {
  let lastError
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 25_000)
    try {
      const response = await fetch(url, { ...options, signal: controller.signal })
      if (!response.ok) throw new Error(`${response.status} from ${new URL(url).hostname}`)
      return response
    } catch (error) {
      lastError = error
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 1_000))
    } finally {
      clearTimeout(timeout)
    }
  }
  throw lastError
}

const json = async (url, options) => (await timeoutFetch(url, options)).json()

const nbaHeaders = {
  Accept: 'application/json, text/plain, */*',
  Origin: 'https://www.nba.com',
  Referer: 'https://www.nba.com/',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0 Safari/537.36',
}

const nba = async (team, season) => {
  const savedRoster = archivedNbaSeason(season, 'roster')
  const savedPlayers = archivedNbaSeason(season, 'stats')
  if (savedRoster && savedPlayers) {
    return {
      roster: savedRoster,
      players: savedPlayers,
      sources: { roster: savedRoster.source, players: savedPlayers.source },
    }
  }

  const key = nbaSeasonKey(season)
  const teamId = '1610612741'
  const base = 'https://stats.nba.com/stats'
  const rosterParams = new URLSearchParams({ LeagueID: '00', Season: key, TeamID: teamId })
  const statsParams = new URLSearchParams({
    LeagueID: '00', PerMode: 'Totals', Season: key, SeasonType: 'Regular Season',
    TeamID: teamId, MeasureType: 'Base', Month: 0, LastNGames: 0,
    OpponentTeamID: 0, PaceAdjust: 'N', PlusMinus: 'N', Rank: 'N',
  })
  const [rosterPayload, statsPayload] = await Promise.all([
    json(`${base}/commonteamroster?${rosterParams}`, { headers: nbaHeaders }),
    json(`${base}/leaguedashplayerstats?${statsParams}`, { headers: nbaHeaders }),
  ])
  return {
    roster: { season: key, teamId, roster: resultRows(rosterPayload, 'CommonTeamRoster'), coaches: resultRows(rosterPayload, 'Coaches') },
    players: { season: key, teamId, players: resultRows(statsPayload, 'LeagueDashPlayerStats'), perMode: 'Totals' },
    sources: { roster: 'NBA Stats', players: 'NBA Stats' },
  }
}

const mlb = async (team, season) => {
  const base = `https://statsapi.mlb.com/api/v1/teams/${team.mlbId}/roster`
  const rosterUrl = `${base}?${new URLSearchParams({ rosterType: 'fullSeason', season, hydrate: 'person' })}`
  const playersUrl = `${base}?${new URLSearchParams({ rosterType: 'fullSeason', season, hydrate: `person(stats(type=season,season=${season},gameType=R))` })}`
  const [roster, players] = await Promise.all([json(rosterUrl), json(playersUrl)])
  return { roster, players, sources: { roster: 'MLB StatsAPI', players: 'MLB StatsAPI' } }
}

const nhl = async (team, season) => {
  const key = `${Number(season) - 1}${Number(season)}`
  const [roster, players] = await Promise.all([
    json(`https://api-web.nhle.com/v1/roster/${team.abbr}/${key}`),
    json(`https://api-web.nhle.com/v1/club-stats/${team.abbr}/${key}/2`),
  ])
  return { roster, players, sources: { roster: 'NHL API', players: 'NHL API' } }
}

const nfl = async (team, season) => {
  const rosterCsv = await (await timeoutFetch(`https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_${season}.csv`)).text()
  const roster = { season: Number(season), team: team.abbr, players: parseCsv(rosterCsv, (row) => row.team === team.abbr) }
  if (Number(season) < 1999) {
    return {
      roster,
      players: { season: Number(season), team: team.abbr, players: [], availableFrom: 1999 },
      sources: { roster: 'nflverse', players: 'Unavailable before 1999' },
    }
  }
  const statsCsv = await (await timeoutFetch(`https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_reg_${season}.csv`)).text()
  const players = { season: Number(season), team: team.abbr, players: parseCsv(statsCsv, (row) => row.recent_team === team.abbr), availableFrom: 1999 }
  return { roster, players, sources: { roster: 'nflverse', players: 'nflverse' } }
}

const countRoster = (team, payload) => {
  if (team.sport === 'baseball') return payload?.roster?.length ?? 0
  if (team.sport === 'football' || team.sport === 'basketball') return payload?.players?.length ?? payload?.roster?.length ?? 0
  return ['forwards', 'defensemen', 'goalies'].reduce((sum, key) => sum + (payload?.[key]?.length ?? 0), 0)
}

const countPlayers = (team, payload) => {
  if (team.sport === 'baseball') return payload?.roster?.length ?? 0
  if (team.sport === 'football' || team.sport === 'basketball') return payload?.players?.length ?? 0
  return (payload?.skaters?.length ?? 0) + (payload?.goalies?.length ?? 0)
}

export function validateSnapshot(snapshot, team) {
  const errors = []
  if (snapshot.schemaVersion !== SCHEMA_VERSION) errors.push('wrong schema version')
  if (snapshot.team !== team.key) errors.push('wrong team')
  if (snapshot.coverage.roster === 'complete' && countRoster(team, snapshot.roster) < 8) errors.push('roster is suspiciously small')
  if (snapshot.coverage.players === 'complete' && countPlayers(team, snapshot.players) < 1) errors.push('player stats are empty')
  if (!snapshot.sources?.roster || !snapshot.sources?.players) errors.push('source attribution is missing')
  return errors
}

export async function importSeason(team, season, importedAt = new Date().toISOString()) {
  const adapter = { baseball: mlb, football: nfl, basketball: nba, hockey: nhl }[team.sport]
  const result = await adapter(team, Number(season))
  const snapshot = {
    schemaVersion: SCHEMA_VERSION,
    team: team.key,
    league: team.league,
    season: Number(season),
    label: seasonLabel(team, season),
    importedAt,
    sources: result.sources,
    coverage: {
      roster: countRoster(team, result.roster) ? 'complete' : 'unavailable',
      players: countPlayers(team, result.players) ? 'complete' : 'unavailable',
    },
    roster: result.roster,
    players: result.players,
  }
  const errors = validateSnapshot(snapshot, team)
  if (errors.length) throw new Error(`${team.key} ${season}: ${errors.join('; ')}`)
  const path = join(ARCHIVE_DIR, team.key, `${Number(season)}.json`)
  await mkdir(dirname(path), { recursive: true })
  try {
    const existing = JSON.parse(await readFile(path, 'utf8'))
    const withoutTimestamp = (value) => {
      const copy = { ...value }
      delete copy.importedAt
      return copy
    }
    if (JSON.stringify(withoutTimestamp(existing)) === JSON.stringify(withoutTimestamp(snapshot))) {
      return { path, snapshot: existing, unchanged: true }
    }
  } catch {
    // First import, or an invalid old file that should be replaced below.
  }
  await writeFile(path, `${JSON.stringify(snapshot, null, 2)}\n`)
  return { path, snapshot, unchanged: false }
}

export async function rebuildIndex() {
  await mkdir(ARCHIVE_DIR, { recursive: true })
  const entries = []
  for (const team of await readdir(ARCHIVE_DIR, { withFileTypes: true })) {
    if (!team.isDirectory()) continue
    for (const file of await readdir(join(ARCHIVE_DIR, team.name))) {
      if (!file.endsWith('.json')) continue
      const snapshot = JSON.parse(await readFile(join(ARCHIVE_DIR, team.name, file), 'utf8'))
      entries.push({ team: snapshot.team, season: snapshot.season, label: snapshot.label, importedAt: snapshot.importedAt, coverage: snapshot.coverage, sources: snapshot.sources })
    }
  }
  entries.sort((a, b) => a.team.localeCompare(b.team) || b.season - a.season)
  await writeFile(join(ARCHIVE_DIR, 'index.json'), `${JSON.stringify({ schemaVersion: SCHEMA_VERSION, seasons: entries }, null, 2)}\n`)
  return entries
}
