import { TEAMS } from './teams.js'
import { currentSeasonFor } from './seasons.js'
import { resolveState } from './urlState.js'

const chicagoDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: 'numeric', day: 'numeric' })

export function scoreboardDestination(row, now = new Date()) {
  const team = TEAMS.find((entry) => entry.key === row?.teamKey)
  if (!team) return null
  let eventDate = row.date ? new Date(row.date) : now
  if (!Number.isFinite(eventDate.getTime())) eventDate = now
  const parts = Object.fromEntries(chicagoDay.formatToParts(eventDate).map((part) => [part.type, part.value]))
  const calendarDay = new Date(Number(parts.year), Number(parts.month) - 1, Number(parts.day), 12)
  const season = /^\d{4}$/.test(String(row.eventSeason)) ? row.eventSeason : currentSeasonFor(team, calendarDay)
  const params = new URLSearchParams({ team: team.key, season: String(season), tab: 'schedule', type: String(row.seasonType ?? 2), game: String(row.eventId ?? '') })
  return resolveState(params.toString(), team.key, now)
}

const chicagoTime = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' })

export function previewDetails(game, team, now = new Date()) {
  const timestamp = game.date ? new Date(game.date).getTime() : NaN
  const valid = Number.isFinite(timestamp)
  const specialStatus = /postpon|cancel|suspend|delay|\btbd\b|\btba\b/i.test(game.detail ?? '') ? game.detail : ''
  const status = specialStatus || (game.timeTbd ? 'Time TBD' : '')
  const upcoming = !game.completed && game.state !== 'in' && game.state !== 'post' && !status && valid && timestamp >= now.getTime()
  const dateTime = game.timeTbd || !valid ? 'TBD' : chicagoTime.format(new Date(timestamp))
  const venue = [game.venue, game.venueCity].filter(Boolean).join(' · ') || 'Venue TBD'
  return {
    matchup: `${team.name} ${game.home ? 'vs' : 'at'} ${game.opponent?.name ?? 'TBD'}`,
    dateTime,
    status,
    venue,
    broadcast: game.broadcast ?? 'Broadcast TBD',
    canCalendar: Boolean(upcoming && !game.timeTbd),
  }
}
