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
