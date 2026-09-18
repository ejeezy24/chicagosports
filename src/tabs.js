// The panels, in the order they appear. Lives apart from App.jsx so urlState.js
// can validate a `tab` parameter without importing a component.
export const TABS = [
  { id: 'schedule', label: 'Schedule & scores', shortLabel: 'Scores' },
  { id: 'greatgames', label: 'Game finder', shortLabel: 'Finder' },
  { id: 'news', label: 'Team news', shortLabel: 'News' },
  { id: 'lineup', label: 'All-time lineup', shortLabel: 'Lineup' },
  { id: 'playoffrace', label: 'Playoff race', shortLabel: 'Race' },
  { id: 'heatmap', label: 'Heatmap', shortLabel: 'Heatmap' },
  { id: 'rivalry', label: 'Rivalries', shortLabel: 'Rivalries' },
  { id: 'showdown', label: 'Showdown', shortLabel: 'Showdown' },
  { id: 'archive', label: 'Chicago archive', shortLabel: 'Archive' },
  { id: 'roster', label: 'Roster', shortLabel: 'Roster' },
  { id: 'players', label: 'Player stats', shortLabel: 'Players' },
  { id: 'stats', label: 'Team stats', shortLabel: 'Team' },
  { id: 'standings', label: 'Standings', shortLabel: 'Standings' },
]

export const DEFAULT_TAB = TABS[0].id

export const GLOBAL_TABS = [
  { id: 'tonight', label: 'Chicago Tonight' },
  { id: 'mygames', label: 'My Games' },
  { id: 'arcade', label: 'Daily Arcade' },
  { id: 'timemachine', label: 'Time Machine' },
  { id: 'stadiums', label: 'Stadium Explorer' },
]
export const isTab = (id) => [...TABS, ...GLOBAL_TABS].some((t) => t.id === id)
