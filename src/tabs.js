// The panels, in the order they appear. Lives apart from App.jsx so urlState.js
// can validate a `tab` parameter without importing a component.
export const TABS = [
  { id: 'schedule', label: 'Schedule & scores', shortLabel: 'Scores' },
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
]
export const isTab = (id) => [...TABS, ...GLOBAL_TABS].some((t) => t.id === id)
