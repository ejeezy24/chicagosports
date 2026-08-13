// The panels, in the order they appear. Lives apart from App.jsx so urlState.js
// can validate a `tab` parameter without importing a component.
export const TABS = [
  { id: 'schedule', label: 'Schedule & scores', shortLabel: 'Scores' },
  { id: 'archive', label: 'Chicago archive', shortLabel: 'Archive' },
  { id: 'roster', label: 'Roster', shortLabel: 'Roster' },
  { id: 'players', label: 'Player stats', shortLabel: 'Players' },
  { id: 'stats', label: 'Team stats', shortLabel: 'Team' },
  { id: 'standings', label: 'Standings', shortLabel: 'Standings' },
]

export const DEFAULT_TAB = TABS[0].id

export const isTab = (id) => TABS.some((t) => t.id === id)
