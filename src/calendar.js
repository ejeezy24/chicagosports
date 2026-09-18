import { gameKey, isCancelled } from './fan.js'

const escape = (value) => String(value ?? '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,')
const stamp = (date) => new Date(date).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')

export const calendarGames = (games) => games.filter((g) => g.date && !Number.isNaN(new Date(g.date).getTime()) && !g.timeTbd && !isCancelled(g))

// RFC 5545: fold at 75 UTF-8 octets, without splitting a code point.
export function foldLine(line) {
  const encoder = new TextEncoder()
  let out = '', size = 0
  for (const char of line) {
    const bytes = encoder.encode(char).length
    if (size + bytes > 75) { out += '\r\n '; size = 1 }
    out += char
    size += bytes
  }
  return out
}

export function buildCalendar(team, games, now = new Date()) {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Chicago Sports//Game calendar//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${escape(team.name)} games`]
  for (const game of calendarGames(games)) {
    lines.push('BEGIN:VEVENT', `UID:${escape(gameKey(team, game))}@chicago-sports.local`, `DTSTAMP:${stamp(now)}`, `DTSTART:${stamp(game.date)}`,
      `SUMMARY:${escape(`${team.short} ${game.home ? 'vs' : 'at'} ${game.opponent.name}`)}`,
      `LOCATION:${escape(game.venue)}`,
      `DESCRIPTION:${escape([game.broadcast ? `Broadcast: ${game.broadcast}.` : '', 'Start time only; game duration varies. Schedule changes will not update this downloaded calendar.'].filter(Boolean).join(' '))}`,
      'END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.map(foldLine).join('\r\n') + '\r\n'
}

export function downloadCalendar(team, games) {
  const url = URL.createObjectURL(new Blob([buildCalendar(team, games)], { type: 'text/calendar;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = `${team.key}-games.ics`
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
