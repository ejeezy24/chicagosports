// Normalizers for ESPN payloads.
//
// The shape of these responses drifts between leagues and eras: scores arrive
// as objects or bare strings, rosters are sometimes flat and sometimes grouped
// by position, statistics hide under `results.stats` or `splits`. Everything
// here reads defensively and returns a predictable shape, so the components can
// stay dumb.

const first = (...vals) => vals.find((v) => v !== undefined && v !== null)

function scoreOf(competitor) {
  const s = competitor?.score
  if (s === undefined || s === null) return null
  if (typeof s === 'object') {
    const v = first(s.displayValue, s.value)
    return v === undefined ? null : String(v)
  }
  return String(s)
}

function logoOf(team) {
  if (!team) return null
  if (team.logo) return team.logo
  const logos = team.logos ?? []
  return logos[0]?.href ?? null
}

/** One row in the schedule view. */
export function normalizeEvent(event, espnTeamId) {
  const comp = event.competitions?.[0] ?? {}
  const competitors = comp.competitors ?? []

  const us =
    competitors.find((c) => String(c.team?.id) === String(espnTeamId)) ??
    competitors.find((c) => c.homeAway === 'home') ??
    competitors[0]
  const them = competitors.find((c) => c !== us) ?? null

  const status = comp.status ?? event.status ?? {}
  const type = status.type ?? {}
  const state = type.state ?? 'pre' // pre | in | post
  const completed = Boolean(type.completed)

  const ourScore = scoreOf(us)
  const theirScore = scoreOf(them)

  let result = null
  if (completed) {
    if (us?.winner === true) result = 'W'
    else if (them?.winner === true) result = 'L'
    else if (ourScore !== null && theirScore !== null) {
      const a = Number(ourScore)
      const b = Number(theirScore)
      if (Number.isFinite(a) && Number.isFinite(b)) result = a > b ? 'W' : a < b ? 'L' : 'T'
    }
  }

  const venue = comp.venue ?? {}
  const city = [venue.address?.city, venue.address?.state].filter(Boolean).join(', ')

  const broadcast =
    comp.broadcasts?.flatMap((b) => b.names ?? (b.media?.shortName ? [b.media.shortName] : []))?.[0] ??
    null

  const gameDate = first(event.date, comp.date) ?? null

  return {
    id: event.id ?? comp.id,
    date: gameDate,
    week: event.week?.number ?? null,
    home: us?.homeAway === 'home',
    neutral: Boolean(comp.neutralSite),
    // Both ids, so a live scoreboard can be matched onto this row later.
    usId: us?.team?.id ?? null,
    opponent: {
      id: them?.team?.id ?? null,
      name: them?.team?.shortDisplayName ?? them?.team?.displayName ?? 'TBD',
      fullName: them?.team?.displayName ?? 'TBD',
      abbr: them?.team?.abbreviation ?? '',
      logo: logoOf(them?.team),
    },
    ourScore,
    theirScore,
    result,
    state,
    completed,
    detail: first(type.shortDetail, type.detail, type.description) ?? null,
    venue: historicalVenueName(venue.fullName, gameDate),
    venueCity: city || null,
    broadcast,
    note: comp.notes?.[0]?.headline ?? event.notes?.[0]?.headline ?? null,
    record: us?.records?.find((r) => r.type === 'total' || r.name === 'overall')?.summary ?? null,
  }
}

/**
 * Live scores, keyed by event id, from a league scoreboard.
 *
 * The schedule payload omits scores while a game is in progress, so a row that
 * says "Top 7th" has nothing to show next to it. This fills that gap; see
 * `withLiveScores`.
 */
export function scoreboardScores(payload) {
  const out = {}
  for (const event of payload?.events ?? []) {
    const comp = event.competitions?.[0]
    const id = event.id ?? comp?.id
    if (!comp || !id) continue

    const type = comp.status?.type ?? {}
    out[id] = {
      state: type.state ?? null,
      detail: first(type.shortDetail, type.detail) ?? null,
      // Keyed by team so the caller doesn't need to know home from away.
      byTeam: Object.fromEntries(
        (comp.competitors ?? [])
          .filter((c) => c.team?.id)
          .map((c) => [String(c.team.id), scoreOf(c)]),
      ),
    }
  }
  return out
}

/**
 * Overlay live scores onto already-normalized games. Anything not in progress
 * is left exactly as it was — a finished game's score is already correct, and
 * the scoreboard only covers today.
 */
export function withLiveScores(games, scores) {
  if (!scores || Object.keys(scores).length === 0) return games

  let changed = false
  const merged = games.map((g) => {
    const live = scores[g.id]
    if (!live || g.state !== 'in') return g

    const ours = live.byTeam[String(g.usId)]
    const theirs = live.byTeam[String(g.opponent.id)]
    if (ours === undefined && theirs === undefined) return g

    changed = true
    return {
      ...g,
      ourScore: ours ?? g.ourScore,
      theirScore: theirs ?? g.theirScore,
      detail: live.detail ?? g.detail,
    }
  })

  // Keep the same array when nothing moved, so memoised consumers don't rerun.
  return changed ? merged : games
}

export function scheduleEvents(payload, espnTeamId) {
  if (Array.isArray(payload?.games)) {
    return [...payload.games].sort((a, b) => new Date(a.date ?? 0) - new Date(b.date ?? 0))
  }
  const events = payload?.events ?? []
  return events
    .filter((event) => !isPostponedOrCanceled(event))
    .map((e) => normalizeEvent(e, espnTeamId))
    .sort((a, b) => new Date(a.date ?? 0) - new Date(b.date ?? 0))
}

const NON_GAME_STATUS = /postponed|cancel(?:ed|led)|abandoned/i

function isPostponedOrCanceled(event) {
  const comp = event?.competitions?.[0] ?? {}
  const type = comp.status?.type ?? event?.status?.type ?? {}
  const text = [
    type.name,
    type.description,
    type.detail,
    type.shortDetail,
    comp.notes?.[0]?.headline,
    event?.notes?.[0]?.headline,
  ].filter(Boolean).join(' ')
  return NON_GAME_STATUS.test(text)
}

/** ESPN often labels an old building with its current sponsored name. */
export function historicalVenueName(name, date) {
  if (!name || !date) return name ?? null
  const year = new Date(date).getUTCFullYear()
  const eras = {
    'Rocket Arena': year <= 2005 ? 'Gund Arena' : year <= 2019 ? 'Quicken Loans Arena' : null,
    'Mortgage Matchup Center': year <= 2006 ? 'America West Arena' : year <= 2015 ? 'US Airways Center' : null,
    'Moda Center': year <= 2013 ? 'Rose Garden' : null,
    'Sleep Train Arena': year <= 2006 ? 'ARCO Arena' : null,
    'TD Garden': year <= 2005 ? 'FleetCenter' : null,
    'BMO Harris Bradley Center': year <= 2012 ? 'Bradley Center' : null,
    'IZOD Center': year <= 1995 ? 'Brendan Byrne Arena' : year <= 2007 ? 'Continental Airlines Arena' : null,
  }
  return eras[name] ?? name
}

/** Reliable NFL team totals when ESPN's team-statistics route returns 404. */
export function footballStatsFromGames(games) {
  const completed = games.filter((game) => game.completed && game.result)
  const record = recordFromGames(completed)
  const pointsFor = completed.reduce((sum, game) => sum + (Number(game.ourScore) || 0), 0)
  const pointsAgainst = completed.reduce((sum, game) => sum + (Number(game.theirScore) || 0), 0)
  const perGame = (value) => record.played ? (value / record.played).toFixed(1) : '—'
  const stat = (name, displayName, displayValue) => ({ name, displayName, displayValue })

  return {
    source: 'Schedule-derived NFL totals',
    categories: [
      {
        name: 'Record',
        stats: [
          stat('gamesScheduled', 'Games Scheduled', String(games.length)),
          stat('gamesPlayed', 'Games Played', String(record.played)),
          stat('wins', 'Wins', String(record.w)),
          stat('losses', 'Losses', String(record.l)),
          stat('ties', 'Ties', String(record.t)),
          stat('winPercent', 'Win Percentage', record.played ? (record.w / record.played).toFixed(3).replace(/^0/, '') : '—'),
        ],
      },
      {
        name: 'Scoring',
        stats: [
          stat('pointsFor', 'Points For', String(pointsFor)),
          stat('pointsAgainst', 'Points Against', String(pointsAgainst)),
          stat('pointDifferential', 'Point Differential', String(pointsFor - pointsAgainst)),
          stat('pointsPerGame', 'Points Per Game', perGame(pointsFor)),
          stat('allowedPerGame', 'Points Allowed Per Game', perGame(pointsAgainst)),
        ],
      },
    ],
  }
}

/** W-L(-T) across the completed games in a list. */
export function recordFromGames(games) {
  let w = 0
  let l = 0
  let t = 0
  for (const g of games) {
    if (g.result === 'W') w++
    else if (g.result === 'L') l++
    else if (g.result === 'T') t++
  }
  return { w, l, t, played: w + l + t, text: t ? `${w}-${l}-${t}` : `${w}-${l}` }
}

/**
 * Rosters come back either as a flat array of athletes or as position groups
 * (`[{ position: 'offense', items: [...] }]`). Flatten to groups either way.
 */
export function rosterGroups(payload) {
  const raw = payload?.athletes ?? []
  const grouped = raw.length > 0 && Array.isArray(raw[0]?.items)

  const toAthlete = (a) => ({
    id: a.id,
    name: a.fullName ?? a.displayName ?? 'Unknown',
    jersey: a.jersey ?? null,
    position: a.position?.abbreviation ?? a.position?.name ?? null,
    positionName: a.position?.displayName ?? a.position?.name ?? null,
    height: a.displayHeight ?? null,
    weight: a.displayWeight ?? null,
    age: a.age ?? null,
    experience: a.experience?.years ?? null,
    college: a.college?.name ?? a.college?.shortName ?? null,
    birthplace: [a.birthPlace?.city, a.birthPlace?.state ?? a.birthPlace?.country]
      .filter(Boolean)
      .join(', '),
    headshot: a.headshot?.href ?? null,
    bats: a.bats?.abbreviation ?? null,
    throws: a.throws?.abbreviation ?? null,
    status: a.status?.name ?? null,
  })

  const groups = grouped
    ? raw.map((g) => ({
        label: titleCase(g.position ?? g.name ?? 'Players'),
        athletes: (g.items ?? []).map(toAthlete),
      }))
    : [{ label: 'Roster', athletes: raw.map(toAthlete) }]

  return groups.filter((g) => g.athletes.length > 0)
}

export function rosterSeason(payload) {
  const s = payload?.season
  if (!s) return null
  return { year: s.year ?? null, label: s.displayName ?? (s.year ? String(s.year) : null) }
}

export function rosterCoach(payload) {
  const c = Array.isArray(payload?.coach) ? payload.coach[0] : payload?.coach
  if (!c) return null
  const name = [c.firstName, c.lastName].filter(Boolean).join(' ')
  return name || null
}

/**
 * Statistics payloads nest their categories differently per league
 * (`results.stats.categories`, `splits.categories`, ...). Find the first
 * `categories` array anywhere in the tree rather than guessing a path.
 */
export function statCategories(payload) {
  const found = findCategories(payload, 0)
  if (!found) return []
  return found
    .map((c) => ({
      name: c.displayName ?? c.name ?? 'Stats',
      stats: uniqueKeys(
        (c.stats ?? [])
          .map((s, i) => ({
            // Display names repeat inside a category — the NFL `general` group
            // lists three distinct "Fumbles Touchdowns" stats — so key on the
            // machine name, which ESPN does keep unique.
            key: s.name ?? s.abbreviation ?? `stat-${i}`,
            label: s.displayName ?? s.shortDisplayName ?? s.name,
            value: first(s.displayValue, s.value),
            perGame: s.perGameDisplayValue ?? null,
            rank: s.rankDisplayValue ?? (s.rank ? `#${s.rank}` : null),
          }))
          .filter((s) => s.label && s.value !== undefined && s.value !== null),
      ),
    }))
    .filter((c) => c.stats.length > 0)
}

/** Belt and braces: ESPN could repeat a machine name too, and React can't. */
function uniqueKeys(stats) {
  const seen = new Map()
  return stats.map((s) => {
    const n = (seen.get(s.key) ?? 0) + 1
    seen.set(s.key, n)
    return n === 1 ? s : { ...s, key: `${s.key}-${n}` }
  })
}

function findCategories(node, depth) {
  if (!node || typeof node !== 'object' || depth > 6) return null
  if (Array.isArray(node.categories) && node.categories.length > 0) return node.categories
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        const hit = findCategories(item, depth + 1)
        if (hit) return hit
      }
    } else if (value && typeof value === 'object') {
      const hit = findCategories(value, depth + 1)
      if (hit) return hit
    }
  }
  return null
}

/**
 * How many periods a game is supposed to last, per sport. Baseball is open
 * ended — nine innings unless it isn't — so it just numbers whatever it gets.
 */
const REGULATION = { football: 4, basketball: 4, hockey: 3 }

/**
 * Column headings for a line score: numbered through regulation, then overtime.
 * Hockey's second extra column is a shootout rather than a second overtime.
 */
export function periodLabels(sport, count) {
  const regulation = REGULATION[sport]
  if (!regulation) return Array.from({ length: count }, (_, i) => String(i + 1))

  return Array.from({ length: count }, (_, i) => {
    if (i < regulation) return String(i + 1)
    const extra = i - regulation + 1
    if (sport === 'hockey') return extra === 1 ? 'OT' : 'SO'
    return extra === 1 ? 'OT' : `${extra}OT`
  })
}

/**
 * One game in full.
 *
 * The two halves of this come from different places and in different shapes:
 * the line score hangs off `header.competitions[0].competitors`, while team
 * statistics live under `boxscore.teams` — flat for football, basketball and
 * hockey, but grouped into batting/pitching/fielding for baseball. Stat items
 * label themselves `label` in some leagues and `displayName` in others.
 *
 * Stats come back paired against the Chicago club so the UI can show them
 * side by side without knowing which competitor is which.
 */
export function boxscore(payload, espnTeamId, sport) {
  const comp = payload?.header?.competitions?.[0] ?? {}
  const competitors = comp.competitors ?? []
  if (competitors.length === 0) return null

  const us = competitors.find((c) => String(c.team?.id) === String(espnTeamId)) ?? competitors[0]

  // Away team on top, the way a boxscore is always printed.
  const ordered = [...competitors].sort((a) => (a.homeAway === 'home' ? 1 : -1))

  const periods = Math.max(0, ...competitors.map((c) => (c.linescores ?? []).length))
  // Hits and errors are a baseball thing; the column only appears if ESPN sent it.
  const hasHitsErrors = competitors.some((c) => c.hits !== undefined || c.errors !== undefined)

  const rows = ordered.map((c) => ({
    id: c.team?.id ?? c.id ?? null,
    name: c.team?.shortDisplayName ?? c.team?.displayName ?? 'Unknown',
    abbr: c.team?.abbreviation ?? '',
    logo: logoOf(c.team),
    isUs: c === us,
    winner: c.winner === true,
    scores: Array.from({ length: periods }, (_, i) => {
      const cell = (c.linescores ?? [])[i]
      if (!cell) return '—'
      return String(first(cell.displayValue, cell.value) ?? '—')
    }),
    total: scoreOf(c) ?? '—',
    hits: c.hits ?? null,
    errors: c.errors ?? null,
  }))

  return {
    periodLabels: periodLabels(sport, periods),
    rows,
    hasHitsErrors,
    statGroups: pairStats(payload?.boxscore?.teams ?? [], us),
    playerTables: playerTables(payload?.boxscore?.players ?? [], us),
    info: gameInfo(payload?.gameInfo),
  }
}

/**
 * Per-player lines, which ESPN ships as parallel arrays: a list of column
 * headings and, for each athlete, a list of values in the same order.
 *
 * Categories name themselves inconsistently — baseball puts "batting" in
 * `type`, football and hockey put "passing" or "goalies" in `name`, and
 * basketball leaves both blank because it only has the one. Empty categories
 * turn up too (hockey sends a "skaters" group with nobody in it).
 */
function playerTables(sides, us) {
  const ordered = [...sides].sort((a, b) => {
    const aIsUs = String(a.team?.id) === String(us?.team?.id)
    return aIsUs ? -1 : String(b.team?.id) === String(us?.team?.id) ? 1 : 0
  })

  return ordered
    .map((side) => ({
      team: {
        name: side.team?.displayName ?? side.team?.shortDisplayName ?? 'Unknown',
        abbr: side.team?.abbreviation ?? '',
        logo: logoOf(side.team),
        isUs: String(side.team?.id) === String(us?.team?.id),
      },
      categories: (side.statistics ?? [])
        .map((c) => {
          const columns = c.labels ?? c.names ?? []
          const athletes = (c.athletes ?? []).filter((a) => a.athlete)
          return {
            name: titleCase(c.name || c.type || 'Players'),
            columns,
            rows: athletes.map((a) => ({
              id: a.athlete.id ?? a.athlete.displayName,
              name: a.athlete.shortName ?? a.athlete.displayName ?? 'Unknown',
              position: a.athlete.position?.abbreviation ?? a.position?.abbreviation ?? null,
              starter: Boolean(a.starter),
              // Pad or trim so every row lines up with the header, whatever
              // ESPN sent.
              stats: columns.map((_, i) => a.stats?.[i] ?? '—'),
            })),
            totals: Array.isArray(c.totals) && c.totals.length ? c.totals : null,
          }
        })
        .filter((c) => c.columns.length > 0 && c.rows.length > 0),
    }))
    .filter((side) => side.categories.length > 0)
}

const statLabel = (s) => s.label ?? s.displayName ?? s.shortDisplayName ?? s.name

/** Line up each team's statistics against the other's, keeping ESPN's order. */
function pairStats(teams, us) {
  const ourStats = teams.find((t) => String(t.team?.id) === String(us?.team?.id))
  const theirStats = teams.find((t) => t !== ourStats) ?? null
  if (!ourStats) return []

  // Baseball nests its stats one level deeper than everyone else.
  const groupsOf = (side) => {
    const stats = side?.statistics ?? []
    const grouped = stats.length > 0 && Array.isArray(stats[0]?.stats)
    return grouped
      ? stats.map((g) => ({ name: g.displayName ?? titleCase(g.name ?? ''), stats: g.stats ?? [] }))
      : [{ name: 'Team stats', stats }]
  }

  const ours = groupsOf(ourStats)
  const theirs = groupsOf(theirStats)

  return ours
    .filter((g) => g.name.toLowerCase() !== 'records') // season record, not a game stat
    .map((group, i) => ({
      name: group.name,
      // Machine names repeat here too — football reports both interceptions
      // thrown and interceptions caught as `interceptions`.
      stats: uniqueKeys(
        group.stats
        .map((s, j) => {
          const mirror = theirs[i]?.stats?.[j]
          // Only trust the mirrored index if it is the same statistic.
          const opponent = statLabel(mirror ?? {}) === statLabel(s) ? mirror : null
          return {
            key: s.name ?? s.abbreviation ?? `${i}-${j}`,
            label: statLabel(s),
            us: first(s.displayValue, s.value),
            them: opponent ? first(opponent.displayValue, opponent.value) : null,
          }
        })
        .filter((s) => s.label && s.us !== undefined && s.us !== null),
      ),
    }))
    .filter((g) => g.stats.length > 0)
}

function gameInfo(info) {
  if (!info) return null
  const attendance = Number(info.attendance)
  return {
    venue: info.venue?.fullName ?? null,
    attendance: Number.isFinite(attendance) && attendance > 0 ? attendance.toLocaleString() : null,
    duration: info.gameDuration ?? null,
  }
}

/**
 * Standings arrive as a tree of conferences/divisions; collect every node that
 * actually carries entries, keeping the group name for the table header.
 */
export function standingsGroups(payload) {
  const out = []
  walkStandings(payload, out, 0)
  return out.filter((g) => g.rows.length > 0)
}

/**
 * The whole league is worth showing — it's how you see where the club sits
 * against everyone else — but its own division shouldn't be the fourth table
 * down. Lead with the division the club is in and leave the rest in order.
 */
export function ownDivisionFirst(groups, espnTeamId) {
  const i = groups.findIndex((g) => g.rows.some((r) => String(r.id) === String(espnTeamId)))
  if (i <= 0) return groups
  return [groups[i], ...groups.slice(0, i), ...groups.slice(i + 1)]
}

function walkStandings(node, out, depth) {
  if (!node || typeof node !== 'object' || depth > 6) return
  const entries = node.standings?.entries
  if (Array.isArray(entries) && entries.length > 0) {
    out.push({
      name: node.name ?? node.displayName ?? node.abbreviation ?? 'Standings',
      rows: entries.map((e) => ({
        id: e.team?.id ?? e.id ?? null,
        team: e.team?.displayName ?? e.team?.name ?? e.note?.headline ?? 'Unknown',
        abbr: e.team?.abbreviation ?? '',
        logo: e.team?.logos?.[0]?.href ?? null,
        stats: (e.stats ?? [])
          .filter((s) => s.displayValue !== undefined && s.displayValue !== null)
          .map((s) => ({
            key: s.name ?? s.abbreviation ?? s.type,
            label: s.shortDisplayName ?? s.abbreviation ?? s.displayName ?? s.name,
            value: s.displayValue,
          })),
      })),
    })
  }
  for (const child of node.children ?? []) walkStandings(child, out, depth + 1)
}

function titleCase(s) {
  return String(s)
    .replace(/[_-]+/g, ' ')
    // ESPN mixes separators with camelCase: "kickReturns" -> "Kick Returns".
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim()
}
