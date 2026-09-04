import { monthKey } from './format.js'

const pad = (value) => String(value).padStart(2, '0')
const utcStamp = (value) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
}
const escapeIcs = (value) => String(value ?? '')
  .replace(/\\/g, '\\\\')
  .replace(/\r\n|\r|\n/g, '\\n')
  .replace(/,/g, '\\,')
  .replace(/;/g, '\\;')

const foldLine = (line) => {
  const encoder = new TextEncoder()
  const parts = []
  let current = ''
  for (const char of line) {
    const limit = parts.length ? 74 : 75
    if (current && encoder.encode(current + char).length > limit) {
      parts.push(current)
      current = char
    } else current += char
  }
  if (current) parts.push(current)
  return parts.map((part, index) => index ? ` ${part}` : part).join('\r\n')
}

const eventLines = (game, team, generatedAt = new Date()) => {
  const scheduled = new Date(game.date)
  if (Number.isNaN(scheduled.getTime()) || game.timeTbd) return null
  const start = utcStamp(game.date)
  if (!start) return null
  const end = utcStamp(scheduled.getTime() + 2 * 60 * 60_000)
  const matchup = `${team.name} ${game.home ? 'vs' : 'at'} ${game.opponent?.name ?? 'TBD'}`
  const description = [game.broadcast ? `Watch: ${game.broadcast}` : null, 'Chicago Sports schedule'].filter(Boolean).join(' · ')
  return [
    'BEGIN:VEVENT', `UID:${escapeIcs(game.id ?? start)}@chicagosports.vercel.app`, `DTSTAMP:${utcStamp(generatedAt)}`,
    `DTSTART:${start}`, `DTEND:${end}`, `SUMMARY:${escapeIcs(matchup)}`,
    `LOCATION:${escapeIcs(game.venue ?? '')}`, `DESCRIPTION:${escapeIcs(description)}`, 'END:VEVENT',
  ]
}

const calendarDocument = (events, name = null) => {
  if (!events.length) return null
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Chicago Sports//Schedule//EN',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    ...(name ? [`X-WR-CALNAME:${escapeIcs(name)}`] : []),
    ...events.flat(), 'END:VCALENDAR', '',
  ]
  return lines.map(foldLine).join(String.fromCharCode(13, 10))
}

export function calendarEvent(game, team) {
  const lines = eventLines(game, team)
  return lines ? calendarDocument([lines]) : null
}

export function calendarSchedule(games, team, now = new Date()) {
  const threshold = now.getTime()
  const events = games
    .filter((game) => !game.completed && game.state !== 'in' && new Date(game.date).getTime() >= threshold)
    .map((game) => eventLines(game, team, now))
    .filter(Boolean)
  return calendarDocument(events, `${team.name} upcoming games`)
}

function saveCalendar(contents, filename) {
  if (!contents) return false
  const blob = new Blob([contents], { type: 'text/calendar;charset=utf-8' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  link.hidden = true
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(link.href), 0)
  return true
}

export function downloadCalendar(game, team) {
  return saveCalendar(
    calendarEvent(game, team),
    `${team.key}-${game.opponent?.abbr || 'game'}-${String(game.date).slice(0, 10)}.ics`,
  )
}

export function downloadSchedule(games, team) {
  return saveCalendar(calendarSchedule(games, team), `${team.key}-upcoming-schedule.ics`)
}

export function groupedMonths(games) {
  const groups = []
  for (const game of games) {
    const label = monthKey(game.date)
    const last = groups.at(-1)
    if (last?.label === label) last.games.push(game)
    else groups.push({ label, games: [game] })
  }
  return groups
}

export function initialOpenMonths(groups, now = new Date(), preferredGameId = null) {
  if (!groups.length) return new Set()
  const preferred = preferredGameId
    ? groups.find((group) => group.games.some((game) => String(game.id) === String(preferredGameId)))
    : null
  const current = monthKey(now.toISOString())
  const match = preferred ?? groups.find((group) => group.label === current)
  return new Set([match?.label ?? groups[0].label])
}

export function reconcileOpenMonths(current, groups, now = new Date()) {
  const available = new Set(groups.map((group) => group.label))
  const kept = new Set([...current].filter((label) => available.has(label)))
  return kept.size ? kept : initialOpenMonths(groups, now)
}
