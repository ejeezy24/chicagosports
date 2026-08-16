import { seasonLabel } from './seasons.js'

const ARCHIVE_LABELS = {
  story: 'Season story', compare: 'Compare', history: 'Timeline', records: 'Leaders',
  rivalries: 'Rivalries', search: 'Search', favorites: 'Favorites',
}
const TAB_LABELS = { schedule: 'Schedule & scores', archive: 'Chicago archive', roster: 'Roster', players: 'Player stats', stats: 'Team stats', standings: 'Standings' }

export function canonicalState({ team, season, tab, archiveView = 'story', includeOlder = false }, origin) {
  const params = new URLSearchParams({ team: team.key, season: String(season), tab })
  if (tab === 'archive' && archiveView !== 'story') params.set('view', archiveView)
  if (includeOlder) params.set('older', '1')
  const section = tab === 'archive' ? ARCHIVE_LABELS[archiveView] ?? 'Chicago archive' : TAB_LABELS[tab] ?? 'Chicago sports'
  const label = seasonLabel(team, season)
  return {
    url: `${origin}/?${params}`,
    title: `${label} ${team.name} ${section} | Chicago Sports`,
    description: `${section} for the ${label} ${team.name}, with Chicago schedules, scores, statistics, and history.`,
  }
}
