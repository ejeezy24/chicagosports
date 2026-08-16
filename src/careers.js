import { archivedPlayerStats } from './players.js'
import { seasonLabel } from './seasons.js'

export const playerNameKey = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

const numeric = (value) => {
  if (value === undefined || value === null || value === '' || value === '—') return null
  const number = Number(String(value).replace(/[%,$]/g, '').replace(/,/g, ''))
  return Number.isFinite(number) ? number : null
}

export function playerCareer(team, snapshots, player) {
  const key = playerNameKey(player?.name)
  if (!key) return []
  return snapshots.flatMap((snapshot) => {
    const lines = archivedPlayerStats(team, snapshot.players).flatMap((group) => {
      const row = group.rows.find((candidate) => playerNameKey(candidate.name) === key)
      return row ? [{ name: group.name, columns: group.columns, values: row.values }] : []
    })
    return lines.length ? [{ season: snapshot.season, label: seasonLabel(team, snapshot.season), lines }] : []
  })
}

const RECORD_COLUMNS = {
  baseball: new Set(['H', 'HR', 'RBI', 'SB', 'W', 'SV', 'SO']),
  football: new Set(['YDS', 'TD', 'REC', 'TFL', 'SACK', 'INT', 'FG', 'PUNTS']),
  basketball: new Set(['PTS', 'REB', 'AST', 'STL', 'BLK']),
  hockey: new Set(['G', 'A', 'PTS', 'W', 'SV']),
}

export function seasonFileRecords(team, snapshots) {
  const allowed = RECORD_COLUMNS[team.sport] ?? new Set()
  const records = new Map()

  for (const snapshot of snapshots) {
    for (const group of archivedPlayerStats(team, snapshot.players)) {
      group.columns.forEach((column, index) => {
        if (!allowed.has(column)) return
        const id = `${group.name}:${column}`
        for (const row of group.rows) {
          const value = numeric(row.values[index])
          if (value === null) continue
          const previous = records.get(id)
          if (!previous || value > previous.number) {
            records.set(id, {
              id,
              group: group.name,
              metric: column,
              player: row.name,
              value: row.values[index],
              number: value,
              season: snapshot.season,
              label: seasonLabel(team, snapshot.season),
            })
          }
        }
      })
    }
  }

  return [...records.values()]
    .sort((a, b) => a.group.localeCompare(b.group) || a.metric.localeCompare(b.metric))
    .slice(0, 12)
}
