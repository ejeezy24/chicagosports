import { monthKey } from './format.js'

const pad = (value) => String(value).padStart(2, '0')
const utcStamp = (value) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
}
const escapeIcs = (value) => String(value ?? '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')

export function calendarEvent(game, team) {
  const scheduled = new Date(game.date)
  if (Number.isNaN(scheduled.getTime()) || (scheduled.getUTCHours() === 0 && scheduled.getUTCMinutes() === 0)) return null
  const start = utcStamp(game.date)
  if (!start) return null
  const end = utcStamp(new Date(game.date).getTime() + 2 * 60 * 60_000)
  const matchup = `${team.name} ${game.home ? 'vs' : 'at'} ${game.opponent?.name ?? 'TBD'}`
  const description = [game.broadcast ? `Watch: ${game.broadcast}` : null, 'Chicago Sports schedule'].filter(Boolean).join(' · ')
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Chicago Sports//Schedule//EN', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT', `UID:${escapeIcs(game.id ?? start)}@chicagosports.vercel.app`, `DTSTAMP:${utcStamp(new Date())}`,
    `DTSTART:${start}`, `DTEND:${end}`, `SUMMARY:${escapeIcs(matchup)}`,
    `LOCATION:${escapeIcs(game.venue ?? '')}`, `DESCRIPTION:${escapeIcs(description)}`, 'END:VEVENT', 'END:VCALENDAR', '',
  ].join('\r\n')
}

export function downloadCalendar(game, team) {
  const contents = calendarEvent(game, team)
  if (!contents) return false
  const blob = new Blob([contents], { type: 'text/calendar;charset=utf-8' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `${team.key}-${game.opponent?.abbr || 'game'}-${String(game.date).slice(0, 10)}.ics`
  link.click()
  URL.revokeObjectURL(link.href)
  return true
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

export function initialOpenMonths(groups, now = new Date()) {
  if (!groups.length) return new Set()
  const current = monthKey(now.toISOString())
  const match = groups.find((group) => group.label === current)
  return new Set([match?.label ?? groups[0].label])
}
