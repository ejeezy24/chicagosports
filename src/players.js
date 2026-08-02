// Rosters and season statistics for a team's players, from two sources.
//
// ESPN does not serve historical rosters at all. Its site endpoint answers 200
// with an empty athlete list for any past season, and its other two return the
// *current* squad no matter which year is asked for — the season segment is
// decorative. So for past seasons baseball comes from MLB's API here, and the
// other three leagues have to say plainly that the data doesn't exist.
//
// ESPN's roster endpoint carries season splits for football, basketball and
// hockey, and describes its own columns — each stat arrives with an
// abbreviation and a formatted value, so nothing has to be hardcoded.
//
// It does not do the same for baseball: it publishes splits only for players
// who qualify, which in practice is three or four names out of a 26-man roster.
// MLB's own StatsAPI is public, permits cross-origin requests, and returns the
// whole active roster with stats in a single call, so baseball comes from there
// instead. The cost is that StatsAPI returns raw keys with no labels, so the
// columns below are chosen rather than discovered.
//
// Both sources are normalised to the same shape:
//   [{ name, columns: [label], rows: [{ id, name, position, jersey, values }] }]

const HITTING = [
  ['gamesPlayed', 'G'],
  ['atBats', 'AB'],
  ['runs', 'R'],
  ['hits', 'H'],
  ['doubles', '2B'],
  ['triples', '3B'],
  ['homeRuns', 'HR'],
  ['rbi', 'RBI'],
  ['baseOnBalls', 'BB'],
  ['strikeOuts', 'SO'],
  ['stolenBases', 'SB'],
  ['avg', 'AVG'],
  ['obp', 'OBP'],
  ['slg', 'SLG'],
  ['ops', 'OPS'],
]

const PITCHING = [
  ['wins', 'W'],
  ['losses', 'L'],
  ['era', 'ERA'],
  ['gamesPlayed', 'G'],
  ['gamesStarted', 'GS'],
  ['saves', 'SV'],
  ['inningsPitched', 'IP'],
  ['hits', 'H'],
  ['runs', 'R'],
  ['earnedRuns', 'ER'],
  ['homeRuns', 'HR'],
  ['baseOnBalls', 'BB'],
  ['strikeOuts', 'SO'],
  ['whip', 'WHIP'],
]

const MLB_GROUPS = [
  { key: 'hitting', name: 'Hitting', columns: HITTING },
  { key: 'pitching', name: 'Pitching', columns: PITCHING },
]

/**
 * A player traded mid-season gets one split per club plus a combined line
 * (marked with `numTeams`). On a team page the club's own split is the honest
 * one — a pitcher acquired in July should read as three games, not thirty.
 */
function splitForTeam(entry, mlbTeamId) {
  const splits = entry?.splits ?? []
  return (
    splits.find((s) => String(s.team?.id) === String(mlbTeamId)) ??
    splits.find((s) => !s.numTeams) ??
    splits[0] ??
    null
  )
}

/** Positions grouped the way a baseball roster is always printed. */
const MLB_POSITION_ORDER = ['Pitcher', 'Catcher', 'Infielder', 'Outfielder']

const PLURAL = {
  Pitcher: 'Pitchers',
  Catcher: 'Catchers',
  Infielder: 'Infielders',
  Outfielder: 'Outfielders',
}

/** How old someone was during a given season, rather than how old they are now. */
function ageDuring(birthDate, season) {
  if (!birthDate) return null
  const born = new Date(birthDate)
  if (Number.isNaN(born.getTime())) return null
  // Midway through the year, so a season reads as one age rather than two.
  const mid = new Date(Date.UTC(Number(season), 5, 30))
  let age = mid.getUTCFullYear() - born.getUTCFullYear()
  const monthDiff = mid.getUTCMonth() - born.getUTCMonth()
  if (monthDiff < 0 || (monthDiff === 0 && mid.getUTCDate() < born.getUTCDate())) age -= 1
  return age > 0 && age < 120 ? age : null
}

/**
 * MLB StatsAPI roster, hydrated with each person, in the same shape `rosterGroups`
 * produces from ESPN — so the roster view doesn't care where it came from.
 *
 * Age is computed for the season being viewed. StatsAPI only carries the
 * player's age today, which on a 2015 roster would be a decade out.
 */
export function mlbRosterGroups(payload, season) {
  const roster = (payload?.roster ?? []).filter(Boolean)
  if (roster.length === 0) return []

  const buckets = new Map()

  for (const entry of roster) {
    const person = entry.person ?? {}
    const type = entry.position?.type ?? 'Other'
    const label = PLURAL[type] ?? type

    if (!buckets.has(label)) buckets.set(label, [])
    buckets.get(label).push({
      id: person.id ?? person.fullName,
      name: person.fullName ?? 'Unknown',
      jersey: entry.jerseyNumber ?? person.primaryNumber ?? null,
      position: entry.position?.abbreviation ?? null,
      positionName: entry.position?.name ?? null,
      height: person.height ?? null,
      weight: person.weight ? `${person.weight} lbs` : null,
      age: ageDuring(person.birthDate, season),
      college: null, // StatsAPI doesn't carry it
      birthplace: [person.birthCity, person.birthStateProvince ?? person.birthCountry]
        .filter(Boolean)
        .join(', '),
      headshot: person.id
        ? `https://midfield.mlbstatic.com/v1/people/${person.id}/spots/120`
        : null,
      bats: person.batSide?.code ?? null,
      throws: person.pitchHand?.code ?? null,
      status: entry.status?.description ?? null,
    })
  }

  const order = (label) => {
    const i = MLB_POSITION_ORDER.findIndex((t) => (PLURAL[t] ?? t) === label)
    return i === -1 ? MLB_POSITION_ORDER.length : i
  }

  return [...buckets.entries()]
    .sort((a, b) => order(a[0]) - order(b[0]))
    .map(([label, athletes]) => ({ label, athletes }))
}

/**
 * A CSV row splitter that understands quoted fields. nflverse embeds headshot
 * URLs containing commas — `.../f_auto,q_auto/...` — so splitting on commas
 * alone shifts every later column.
 */
function csvRow(line) {
  const out = []
  let field = ''
  let quoted = false

  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (quoted) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          field += '"' // an escaped quote inside a quoted field
          i++
        } else quoted = false
      } else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      out.push(field)
      field = ''
    } else field += c
  }
  out.push(field)
  return out
}

/** Parse only what we need, and only the rows for one club. */
export function parseCsv(text, keep) {
  const lines = String(text ?? '').split(/\r?\n/)
  if (lines.length < 2) return []

  const header = csvRow(lines[0])
  const rows = []

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue
    const cells = csvRow(lines[i])
    const row = {}
    for (let c = 0; c < header.length; c++) row[header[c]] = cells[c] ?? ''
    if (!keep || keep(row)) rows.push(row)
  }
  return rows
}

// nflverse gives a specific position; a roster is read in three blocks.
const NFL_UNIT = {
  Offense: ['QB', 'RB', 'FB', 'HB', 'WR', 'TE', 'T', 'OT', 'G', 'OG', 'C', 'OL'],
  Defense: ['DE', 'DT', 'NT', 'DL', 'EDGE', 'LB', 'ILB', 'OLB', 'MLB', 'CB', 'DB', 'S', 'FS', 'SS'],
  'Special teams': ['K', 'P', 'LS', 'PK'],
}

const nflUnit = (position) =>
  Object.keys(NFL_UNIT).find((unit) => NFL_UNIT[unit].includes(position)) ?? 'Other'

/**
 * nflverse roster CSV, one file per season, league-wide — filtered to one club
 * and reshaped into what the roster view expects.
 */
export function nflRosterGroups(text, teamAbbr, season) {
  const rows = parseCsv(text, (r) => r.team === teamAbbr)
  if (rows.length === 0) return []

  const buckets = new Map()

  for (const r of rows) {
    const unit = nflUnit(r.position)
    if (!buckets.has(unit)) buckets.set(unit, [])
    buckets.get(unit).push({
      id: r.gsis_id || r.esb_id || `${r.full_name}-${r.jersey_number}`,
      name: r.full_name || [r.first_name, r.last_name].filter(Boolean).join(' ') || 'Unknown',
      jersey: r.jersey_number || null,
      position: r.position || null,
      positionName: r.depth_chart_position || r.position || null,
      height: feetAndInches(r.height),
      weight: r.weight ? `${r.weight} lbs` : null,
      age: ageDuring(r.birth_date, season),
      college: r.college || null,
      birthplace: '', // not in this dataset
      headshot: r.headshot_url || null,
      bats: null,
      throws: null,
      status: r.status || null,
    })
  }

  const order = [...Object.keys(NFL_UNIT), 'Other']
  return [...buckets.entries()]
    .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
    .map(([label, athletes]) => ({
      label,
      athletes: athletes.sort((a, b) => a.name.localeCompare(b.name)),
    }))
}

/**
 * NHL rosters arrive already grouped, and every name is a localised object
 * (`{ default: 'Baun' }`) rather than a string.
 */
const nhlName = (v) => (typeof v === 'string' ? v : (v?.default ?? null))

const NHL_GROUPS = [
  ['forwards', 'Forwards'],
  ['defensemen', 'Defensemen'],
  ['goalies', 'Goalies'],
]

/** Heights come as inches; the rest of the app shows 6' 2". */
function feetAndInches(inches) {
  const n = Number(inches)
  if (!Number.isFinite(n) || n <= 0) return null
  return `${Math.floor(n / 12)}' ${n % 12}"`
}

/** NHL: `api-web.nhle.com/v1/roster/{abbr}/{season}`, in `rosterGroups` shape. */
export function nhlRosterGroups(payload, season) {
  return NHL_GROUPS.map(([key, label]) => ({
    label,
    athletes: (payload?.[key] ?? []).filter(Boolean).map((p) => ({
      id: p.id ?? `${nhlName(p.firstName)}-${nhlName(p.lastName)}`,
      name: [nhlName(p.firstName), nhlName(p.lastName)].filter(Boolean).join(' ') || 'Unknown',
      jersey: p.sweaterNumber ?? null,
      position: p.positionCode ?? null,
      positionName: label.replace(/s$/, ''),
      height: feetAndInches(p.heightInInches),
      weight: p.weightInPounds ? `${p.weightInPounds} lbs` : null,
      age: ageDuring(p.birthDate, season),
      college: null,
      birthplace: [nhlName(p.birthCity), p.birthStateProvince ? nhlName(p.birthStateProvince) : p.birthCountry]
        .filter(Boolean)
        .join(', '),
      headshot: p.headshot ?? null,
      // Skaters shoot, goalies catch; the payload uses one field for both.
      bats: null,
      throws: p.shootsCatches ?? null,
      status: null,
    })),
  })).filter((g) => g.athletes.length > 0)
}

/**
 * NHL: `club-stats/{abbr}/{season}/2`. Skaters and goalies measure different
 * things, so they become separate tables rather than one with half the columns
 * empty.
 */
const NHL_SKATER = [
  ['gamesPlayed', 'GP'],
  ['goals', 'G'],
  ['assists', 'A'],
  ['points', 'P'],
  ['plusMinus', '+/-'],
  ['penaltyMinutes', 'PIM'],
  ['powerPlayGoals', 'PPG'],
  ['shorthandedGoals', 'SHG'],
  ['gameWinningGoals', 'GWG'],
  ['shots', 'S'],
  ['shootingPctg', 'S%'],
  ['avgTimeOnIcePerGame', 'TOI/G'],
  ['faceoffWinPctg', 'FO%'],
]

const NHL_GOALIE = [
  ['gamesPlayed', 'GP'],
  ['gamesStarted', 'GS'],
  ['wins', 'W'],
  ['losses', 'L'],
  ['overtimeLosses', 'OTL'],
  ['goalsAgainstAverage', 'GAA'],
  ['savePercentage', 'SV%'],
  ['shotsAgainst', 'SA'],
  ['saves', 'SV'],
  ['goalsAgainst', 'GA'],
  ['shutouts', 'SO'],
]

/** Rates come as long decimals (0.9234) and time as seconds. */
function nhlValue(key, raw) {
  if (raw === undefined || raw === null) return '—'
  if (key === 'savePercentage' || key === 'shootingPctg' || key === 'faceoffWinPctg') {
    const n = Number(raw)
    if (!Number.isFinite(n)) return String(raw)
    return key === 'savePercentage' ? n.toFixed(3).replace(/^0/, '') : `${(n * 100).toFixed(1)}%`
  }
  if (key === 'avgTimeOnIcePerGame') {
    const n = Number(raw)
    if (!Number.isFinite(n)) return String(raw)
    return `${Math.floor(n / 60)}:${String(Math.round(n % 60)).padStart(2, '0')}`
  }
  if (key === 'goalsAgainstAverage') {
    const n = Number(raw)
    return Number.isFinite(n) ? n.toFixed(2) : String(raw)
  }
  return String(raw)
}

export function nhlPlayerStats(payload) {
  const table = (rows, columns, name) => ({
    name,
    columns: columns.map(([, label]) => label),
    rows: (rows ?? []).filter(Boolean).map((p) => ({
      id: p.playerId ?? `${nhlName(p.firstName)}-${nhlName(p.lastName)}`,
      name: [nhlName(p.firstName), nhlName(p.lastName)].filter(Boolean).join(' ') || 'Unknown',
      position: p.positionCode ?? (name === 'Goalies' ? 'G' : null),
      jersey: null,
      values: columns.map(([key]) => nhlValue(key, p[key])),
    })),
  })

  return [
    table(payload?.skaters, NHL_SKATER, 'Skaters'),
    table(payload?.goalies, NHL_GOALIE, 'Goalies'),
  ].filter((t) => t.rows.length > 0)
}

/** MLB StatsAPI: `teams/{id}/roster` hydrated with each person's season stats. */
export function mlbPlayerStats(payload, mlbTeamId) {
  const roster = (payload?.roster ?? []).filter(Boolean)
  if (roster.length === 0) return []

  return MLB_GROUPS.map((group) => ({
    name: group.name,
    columns: group.columns.map(([, label]) => label),
    rows: roster
      .map((entry) => {
        const stats = entry.person?.stats ?? []
        const forGroup = stats.find((s) => s.group?.displayName === group.key)
        const split = splitForTeam(forGroup, mlbTeamId)
        if (!split) return null

        return {
          id: entry.person?.id ?? entry.person?.fullName,
          name: entry.person?.fullName ?? 'Unknown',
          position: entry.position?.abbreviation ?? null,
          jersey: entry.jerseyNumber ?? null,
          values: group.columns.map(([key]) => {
            const v = split.stat?.[key]
            return v === undefined || v === null ? '—' : String(v)
          }),
        }
      })
      .filter(Boolean),
  })).filter((g) => g.rows.length > 0)
}

/**
 * ESPN: `common/v3/.../teams/{id}/roster`, whose athletes carry their own
 * season splits. The roster spans the whole organisation for some leagues, so
 * only players ESPN actually published stats for end up in a table.
 *
 * Columns are discovered from the data. Players within a category don't always
 * report the identical set, so the union is taken in first-seen order and each
 * row is filled against it — otherwise a player missing one stat would shift
 * every later value into the wrong column.
 */
export function espnPlayerStats(payload) {
  const athletes = (payload?.positionGroups ?? []).flatMap((g) => g?.athletes ?? [])
  if (athletes.length === 0) return []

  const byCategory = new Map()

  for (const athlete of athletes) {
    if (!athlete) continue
    for (const category of athlete.statistics?.splits?.categories ?? []) {
      // ESPN puts literal nulls in these arrays — a category with no stats, or
      // a stat slot left empty — and one of them will take the whole panel down.
      if (!category) continue
      const stats = (category.stats ?? []).filter(Boolean)
      if (stats.length === 0) continue

      const name = category.displayName ?? category.name ?? 'Stats'
      if (!byCategory.has(name)) byCategory.set(name, { columns: new Map(), rows: [] })
      const bucket = byCategory.get(name)

      const values = new Map()
      for (const s of stats) {
        const key = s.name ?? s.abbreviation
        if (!key) continue
        if (!bucket.columns.has(key)) bucket.columns.set(key, s.abbreviation ?? s.shortDisplayName ?? key)
        values.set(key, s.displayValue ?? s.value)
      }

      bucket.rows.push({
        id: athlete.id ?? athlete.displayName,
        name: athlete.displayName ?? 'Unknown',
        position: athlete.position?.abbreviation ?? null,
        jersey: athlete.jersey ?? null,
        values,
      })
    }
  }

  return [...byCategory.entries()].map(([name, bucket]) => {
    const keys = [...bucket.columns.keys()]
    return {
      name,
      columns: keys.map((k) => bucket.columns.get(k)),
      // Fill against the union so every row lines up with the header.
      rows: bucket.rows.map((r) => ({
        ...r,
        values: keys.map((k) => {
          const v = r.values.get(k)
          return v === undefined || v === null ? '—' : String(v)
        }),
      })),
    }
  })
}
