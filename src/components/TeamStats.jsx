import { useState } from 'react'
import { getSchedule, getTeamStats } from '../api.js'
import { curatedStatCategories, footballStatsFromGames, scheduleEvents, statCategories } from '../espn.js'
import { seasonLabel } from '../seasons.js'
import { useAsync } from '../useAsync.js'
import { Async, Panel } from './ui.jsx'

export function TeamStats({ team, season }) {
  const [advanced, setAdvanced] = useState(false)
  const state = useAsync(async () => {
    if (team.sport === 'football') {
      const schedule = await getSchedule(team, season, 2)
      return footballStatsFromGames(scheduleEvents(schedule, team.espnId))
    }
    return getTeamStats(team, season)
  }, [team.key, season])

  return (
    <Panel
      title={`${seasonLabel(team, season)} team statistics`}
      aside={team.sport === 'football' ? 'Regular-season record · scoring' : 'Totals · per game · league rank'}
      note={team.sport === 'football' ? 'Verified record and scoring totals calculated from the regular-season schedule.' : null}
    >
      <Async
        state={state}
        what="team statistics"
        rows={4}
        isEmpty={(d) => statCategories(d).length === 0}
        empty={`No team statistics published for ${seasonLabel(team, season)}.`}
      >
        {(data) => {
          const categories = advanced ? statCategories(data) : curatedStatCategories(data, team.sport)
          return <>
          <div className="stats-toolbar">
            <p>{advanced ? 'Complete provider feed. Some fields may be league-specific.' : 'The most useful team totals and league context.'}</p>
            <button aria-pressed={advanced} onClick={() => setAdvanced((value) => !value)}>{advanced ? 'Key stats' : 'Advanced stats'}</button>
          </div>
          <div className="stat-groups">
            {categories.map((cat) => (
              <div className="stat-group" key={cat.name}>
                <h3>{cat.name}</h3>
                {cat.stats.map((s) => (
                  <div className="stat-row" key={s.key}>
                    <div className="lbl" title={s.label}>
                      {s.label}
                    </div>
                    <div className="val">
                      {s.value}
                      {s.perGame ? (
                        <span className="rank">{s.perGame}/g</span>
                      ) : null}
                      {s.rank ? <span className="rank">{s.rank}</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
          </>
        }}
      </Async>
    </Panel>
  )
}
