// Shared, DOM-free rules for dates, schedule filters, tickets and comparisons.
const chicagoDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' })

export function dayKey(value = new Date()) {
  const date = new Date(value)
  if (!value || Number.isNaN(date.getTime())) return ''
  const parts = Object.fromEntries(chicagoDay.formatToParts(date).map((p) => [p.type, p.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

export function shiftDay(day, amount) {
  const date = new Date(`${day}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + amount)
  return date.toISOString().slice(0, 10)
}

export function dateRange(mode, today = dayKey()) {
  if (mode === 'tomorrow') return [shiftDay(today, 1), shiftDay(today, 1)]
  if (mode === 'weekend') {
    const weekday = new Date(`${today}T12:00:00Z`).getUTCDay()
    const start = shiftDay(today, weekday === 0 ? -2 : weekday === 6 ? -1 : 5 - weekday)
    return [start, shiftDay(start, 2)]
  }
  return [today, today]
}

export const gameKey = (team, game) => `${team.key}:${game.id ?? `${game.date}:${game.opponent?.id ?? game.opponent?.name}`}`
export const chronological = (games) => [...games].sort((a, b) => new Date(a.date) - new Date(b.date))
export const isCancelled = (game) => /cancel|postpon|suspend/i.test(game.detail ?? '')

export function filterGames(games, { opponent = '', location = 'all', day = 'all', status = 'all' } = {}) {
  return games.filter((game) => {
    if (opponent && String(game.opponent?.id ?? game.opponent?.name) !== opponent) return false
    if (location === 'home' && (!game.home || game.neutral)) return false
    if (location === 'away' && (game.home || game.neutral)) return false
    if (location === 'neutral' && !game.neutral) return false
    const key = dayKey(game.date)
    const weekday = key ? new Date(`${key}T12:00:00Z`).getUTCDay() : -1
    if (day === 'weekend' && weekday !== 0 && weekday !== 6) return false
    if (/^[0-6]$/.test(day) && weekday !== Number(day)) return false
    if (status === 'upcoming' && (game.completed || game.state === 'in' || isCancelled(game))) return false
    if (status === 'completed' && !game.completed) return false
    return true
  })
}

export function scoredGames(games) {
  return chronological(games).filter((g) => g.completed && g.ourScore !== null && g.theirScore !== null && g.ourScore !== '' && g.theirScore !== '' && Number.isFinite(Number(g.ourScore)) && Number.isFinite(Number(g.theirScore)))
}

export function seasonSummary(games) {
  const played = scoredGames(games)
  const wins = played.filter((g) => g.result === 'W').length
  const losses = played.filter((g) => g.result === 'L').length
  const ties = played.filter((g) => g.result === 'T').length
  const scored = played.reduce((sum, g) => sum + Number(g.ourScore), 0)
  const allowed = played.reduce((sum, g) => sum + Number(g.theirScore), 0)
  return { played: played.length, wins, losses, ties, scored, allowed, differential: scored - allowed,
    record: `${wins}–${losses}${ties ? `–${ties}` : ''}`, average: played.length ? (scored / played.length).toFixed(1) : '—' }
}

export function normalizeFanData(value) {
  const object = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const tickets = Object.fromEntries(Object.entries(object.tickets ?? {}).filter(([, t]) =>
    t && ['cubs', 'whitesox', 'bears', 'bulls', 'blackhawks'].includes(t.teamKey) && t.game?.opponent &&
    typeof t.game.opponent.name === 'string' && ['attended', 'watched'].includes(t.kind),
  ).map(([key, t]) => [key, { ...t, note: typeof t.note === 'string' ? t.note.slice(0, 500) : '' }]))
  const answers = Object.fromEntries(Object.entries(object.answers ?? {}).filter(([key, a]) =>
    /^\d{4}-\d{2}-\d{2}$/.test(key) && a && typeof a.correct === 'boolean' && Number.isInteger(a.choice),
  ))
  return { version: 1, spoiler: object.spoiler === true, tickets, answers }
}

export function challengeStats(answers, today = dayKey()) {
  const days = Object.keys(answers).filter((d) => answers[d].correct).sort()
  let best = 0, run = 0, previous = null
  for (const day of days) {
    run = previous && shiftDay(previous, 1) === day ? run + 1 : 1
    best = Math.max(best, run)
    previous = day
  }
  let current = 0
  let cursor = answers[today] ? today : shiftDay(today, -1)
  while (answers[cursor]?.correct) { current++; cursor = shiftDay(cursor, -1) }
  return { current, best, wins: days.length, played: Object.keys(answers).length }
}
