// Normalize optional live data without inventing information absent from the feed.
const first = (...values) => values.find((value) => value !== undefined && value !== null && value !== '')
const textOf = (value) => {
  if (value == null) return null
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  return first(value.displayValue, value.shortDisplayValue, value.name, value.text) ?? null
}
const ordinal = (number) => `${number}${number % 100 >= 11 && number % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[number % 10] ?? 'th')}`
function periodLabel(period, sport) {
  const number = Number(typeof period === 'object' ? period?.number : period)
  const label = textOf(period?.displayValue ?? period?.name)
  const half = /^(top|bottom)$/i.test(period?.type ?? '') ? `${period.type} ` : ''
  if (label) return `${half}${label}`
  if (!Number.isFinite(number) || number <= 0) return null
  const unit = sport === 'baseball' ? 'Inning' : ['football', 'basketball'].includes(sport) ? 'Quarter' : 'Period'
  return `${half}${ordinal(number)} ${unit}`
}
function extractPerformers(comp, payload) {
  const out = []
  const add = (row, label) => {
    const athlete = row?.athlete
    const name = first(athlete?.displayName, athlete?.fullName, athlete?.shortName)
    if (!name) return
    const details = [...new Set([row.displayValue, row.summary, row.description].filter((value) => typeof value === 'string' && value))]
    out.push({ label, name, detail: details.join(' · ') || null })
  }
  const walk = (node, label = 'Key performer') => {
    if (Array.isArray(node)) return node.forEach((row) => walk(row, label))
    if (!node || typeof node !== 'object') return
    if (node.athlete) return add(node, label)
    const nextLabel = first(node.displayName, node.name, node.label, label)
    walk(node.leaders ?? node.categories, nextLabel)
  }
  walk(payload?.leaders)
  const featured = comp?.status?.featuredAthletes
  const labels = { winningPitcher: 'Winning pitcher', losingPitcher: 'Losing pitcher', savingPitcher: 'Save' }
  if (Array.isArray(featured)) {
    featured.forEach((row) => add(row, labels[row.type] ?? first(row.displayName, row.name, 'Key performer')))
  } else if (featured && typeof featured === 'object') {
    Object.entries(featured).forEach(([key, rows]) => (Array.isArray(rows) ? rows : [rows]).forEach((row) => add(row, labels[key] ?? key)))
  }
  const seen = new Set()
  return out.filter((row) => {
    const key = `${row.name}:${row.label}:${row.detail}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, 8)
}
function rawPlays(payload) {
  if (Array.isArray(payload?.plays) && payload.plays.length) return payload.plays
  const drives = Array.isArray(payload?.drives) ? payload.drives : [
    ...(Array.isArray(payload?.drives?.previous) ? payload.drives.previous : []),
    ...(payload?.drives?.current ? [payload.drives.current] : []),
  ]
  return drives.flatMap((drive) => Array.isArray(drive?.plays) ? drive.plays : [])
}
function normalizePlays(rows, sport) {
  // MLB supplies pitches AND completed at-bat summaries; keep the latter when available.
  const canonical = sport === 'baseball' && rows.some((row) => row?.type?.type === 'play-result')
    ? rows.filter((row) => row?.type?.type === 'play-result') : rows
  const seen = new Set()
  return canonical.flatMap((play, index) => {
    const text = first(play?.text, play?.shortText, play?.description, play?.type?.text)
    if (!text) return []
    const id = String(play.id ?? `${index}-${text}`)
    if (seen.has(id)) return []
    seen.add(id)
    return [{ id, text, scoring: play.scoringPlay === true, period: periodLabel(play.period, sport), clock: textOf(play.clock) }]
  })
}
export function normalizeLiveGame(payload, team) {
  const comp = payload?.header?.competitions?.[0] ?? {}
  const status = comp.status ?? {}
  const type = status.type ?? status
  const competitors = Array.isArray(comp.competitors) ? comp.competitors : []
  const us = competitors.find((item) => String(item?.team?.id) === String(team?.espnId))
  const opponent = competitors.find((item) => item !== us)
  const rawState = String(first(type.state, type.name, 'pre')).toLowerCase()
  const completed = type.completed === true || rawState === 'post' || rawState.includes('final')
  const plays = normalizePlays(rawPlays(payload), team?.sport)
  const dedicated = normalizePlays(Array.isArray(payload?.scoringPlays) ? payload.scoringPlays : [], team?.sport)
  const scoringPlays = dedicated.length ? dedicated : plays.filter((play) => play.scoring)
  return {
    state: completed ? 'post' : ['in', 'status_in_progress'].includes(rawState) ? 'in' : rawState,
    completed,
    status: first(type.shortDetail, type.detail, type.description, type.name) ?? null,
    period: completed ? null : periodLabel(status.period, team?.sport),
    clock: completed ? null : textOf(first(status.displayClock, status.clock)),
    teams: competitors.map((item) => ({
      id: item?.team?.id ?? item?.id ?? null,
      name: first(item?.team?.displayName, item?.team?.shortDisplayName, item?.team?.abbreviation, 'Team'),
      abbr: item?.team?.abbreviation ?? '',
      logo: item?.team?.logo ?? item?.team?.logos?.[0]?.href ?? null,
      score: textOf(item?.score) ?? '—', isUs: item === us, winner: item?.winner === true,
    })),
    opponent: opponent ? first(opponent.team?.shortDisplayName, opponent.team?.displayName, opponent.team?.abbreviation) : null,
    performers: extractPerformers(comp, payload), plays, scoringPlays,
    hasPlayData: plays.length > 0 || scoringPlays.length > 0,
  }
}
export const liveStateIsOngoing = (model) => Boolean(model && !model.completed && model.state === 'in')
