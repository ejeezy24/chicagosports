import { normalizeEvent } from './espn.js'
import { formatTime } from './format.js'

const chicagoDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
})
const CACHE_TTL_MS = 30 * 60_000

export function scoreboardDateKey(now = new Date(), dayOffset = 0) {
  const parts = Object.fromEntries(chicagoDate.formatToParts(now).map((part) => [part.type, part.value]))
  const day = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + dayOffset, 12))
  return `${day.getUTCFullYear()}${String(day.getUTCMonth() + 1).padStart(2, '0')}${String(day.getUTCDate()).padStart(2, '0')}`
}

export function cityScoreboardRows(payloads, teams) {
  const rows = []
  for (const team of teams) {
    const payload = payloads?.[team.key]
    const events = (payload?.events ?? []).filter((event) =>
      (event.competitions?.[0]?.competitors ?? []).some((entry) => String(entry.team?.id) === String(team.espnId)),
    )
    for (const event of events) {
      const game = normalizeEvent(event, team.espnId)
      const live = game.state === 'in'
      const final = game.completed || game.state === 'post'
      rows.push({
        teamKey: team.key,
        team: team.short,
        eventId: game.id,
        live,
        final,
        status: live ? `LIVE${game.detail ? ` · ${game.detail}` : ''}` : final ? 'FINAL' : (formatTime(game.date) || 'TBD'),
        detail: `${game.home ? 'vs' : '@'} ${game.opponent.name}${game.broadcast ? ` · ${game.broadcast}` : ''}`,
        score: live || final ? `${game.ourScore ?? '—'}–${game.theirScore ?? '—'}` : null,
        date: game.date,
      })
    }
  }
  return rows.sort((a, b) => Number(b.live) - Number(a.live) || Number(b.final) - Number(a.final) || new Date(a.date ?? 0) - new Date(b.date ?? 0))
}

export function mergeScoreboardRows(cachedRows = [], freshRows = [], successfulTeamKeys = []) {
  const replaced = new Set(successfulTeamKeys)
  return [...freshRows, ...cachedRows.filter((row) => !replaced.has(row.teamKey))]
    .sort((a, b) => Number(b.live) - Number(a.live) || Number(b.final) - Number(a.final) || new Date(a.date ?? 0) - new Date(b.date ?? 0))
}

export const scoreboardCache = {
  read(storage, dateKey, now = Date.now()) {
    try {
      const value = JSON.parse(storage?.getItem(`cs.scoreboard.${dateKey}`) ?? 'null')
      if (!value || !Array.isArray(value.rows) || !Number.isFinite(value.savedAt) || now - value.savedAt > CACHE_TTL_MS) return null
      return value
    } catch { return null }
  },
  write(storage, dateKey, rows, now = Date.now()) {
    try { storage?.setItem(`cs.scoreboard.${dateKey}`, JSON.stringify({ rows, savedAt: now })) } catch { /* storage is optional */ }
  },
}

export function todayRows(overview, teams) {
  return teams
    .map((team, index) => {
      const info = overview?.[team.key]
      if (!info?.next) return null
      return {
        teamKey: team.key,
        team: team.short,
        status: info.live ? 'LIVE' : 'NEXT',
        detail: info.next.replace(/^LIVE\s+/, ''),
        live: Boolean(info.live),
        index,
      }
    })
    .filter(Boolean)
    .sort((a, b) => Number(b.live) - Number(a.live) || a.index - b.index)
}
