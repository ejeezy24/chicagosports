export const DEFAULT_FILTERS = { opponent: '', location: 'all', day: 'all', status: 'all' }
export function ScheduleFilters({ games, filters, setFilters }) {
  const opponents = [...new Map(games.map((g) => [String(g.opponent.id ?? g.opponent.name), g.opponent.name])).entries()].sort((a, b) => a[1].localeCompare(b[1]))
  const setFilter = (key, value) => setFilters((previous) => ({ ...previous, [key]: value }))
  return (<div className="filter-bar">
          <label>Opponent<select value={filters.opponent} onChange={(e) => setFilter('opponent', e.target.value)}><option value="">All opponents</option>{opponents.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
          <label>Location<select value={filters.location} onChange={(e) => setFilter('location', e.target.value)}><option value="all">All locations</option><option value="home">Home</option><option value="away">Away</option><option value="neutral">Neutral site</option></select></label>
          <label>Day<select value={filters.day} onChange={(e) => setFilter('day', e.target.value)}><option value="all">Any day</option><option value="weekend">Weekend</option>{['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day, i) => <option value={i} key={day}>{day}</option>)}</select></label>
          <label>Status<select value={filters.status} onChange={(e) => setFilter('status', e.target.value)}><option value="all">All games</option><option value="upcoming">Upcoming</option><option value="completed">Completed</option></select></label>
          <button className="text-button" onClick={() => setFilters(DEFAULT_FILTERS)}>Clear filters</button>
        </div>)
}
