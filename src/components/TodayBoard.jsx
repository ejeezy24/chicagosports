import { TEAMS, accentFor } from '../teams.js'
import { todayRows } from '../today.js'

export function TodayBoard({ overview, onSelect }) {
  const rows = todayRows(overview, TEAMS)
  return (
    <section className="today-board" aria-labelledby="today-heading">
      <div className="today-head">
        <div><span>City scoreboard</span><h2 id="today-heading">Today in Chicago</h2></div>
        <p>Live games and each club&apos;s next start.</p>
      </div>
      <div className="today-games">
        {rows.length ? rows.map((row) => (
          <button key={row.teamKey} onClick={() => onSelect(row.teamKey)} style={{ '--card-color': accentFor(TEAMS.find((team) => team.key === row.teamKey)) }}>
            <span className={row.live ? 'is-live' : ''}>{row.status}</span>
            <strong>{row.team}</strong>
            <em>{row.detail}</em>
          </button>
        )) : <p className="today-empty">The city scoreboard is updating.</p>}
      </div>
    </section>
  )
}
