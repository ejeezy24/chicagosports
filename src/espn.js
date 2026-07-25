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

  return {
    id: event.id ?? comp.id,
    date: first(event.date, comp.date) ?? null,
    week: event.week?.number ?? null,
    home: us?.homeAway === 'home',
    neutral: Boolean(comp.neutralSite),
    opponent: {
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
    venue: venue.fullName ?? null,
    venueCity: city || null,
    broadcast,
    note: comp.notes?.[0]?.headline ?? event.notes?.[0]?.headline ?? null,
    record: us?.records?.find((r) => r.type === 'total' || r.name === 'overall')?.summary ?? null,
  }
}

export function scheduleEvents(payload, espnTeamId) {
  const events = payload?.events ?? []
  return events
    .map((e) => normalizeEvent(e, espnTeamId))
    .sort((a, b) => new Date(a.date ?? 0) - new Date(b.date ?? 0))
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
      stats: (c.stats ?? [])
        .map((s) => ({
          label: s.displayName ?? s.shortDisplayName ?? s.name,
          value: first(s.displayValue, s.value),
          perGame: s.perGameDisplayValue ?? null,
          rank: s.rankDisplayValue ?? (s.rank ? `#${s.rank}` : null),
        }))
        .filter((s) => s.label && s.value !== undefined && s.value !== null),
    }))
    .filter((c) => c.stats.length > 0)
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
 * Standings arrive as a tree of conferences/divisions; collect every node that
 * actually carries entries, keeping the group name for the table header.
 */
export function standingsGroups(payload) {
  const out = []
  walkStandings(payload, out, 0)
  return out.filter((g) => g.rows.length > 0)
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
    .replace(/\b\w/g, (c) => c.toUpperCase())
}
