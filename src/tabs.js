// The panels, in the order they appear. Lives apart from App.jsx so urlState.js
// can validate a `tab` parameter without importing a component.
export const TABS = [
  { id: 'schedule', label: 'Schedule & scores' },
  { id: 'roster', label: 'Roster' },
  { id: 'players', label: 'Player stats' },
  { id: 'stats', label: 'Team stats' },
  { id: 'standings', label: 'Standings' },
]

export const DEFAULT_TAB = TABS[0].id

export const isTab = (id) => TABS.some((t) => t.id === id)
