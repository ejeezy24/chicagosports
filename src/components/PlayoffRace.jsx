import { getSchedule, getStandings } from '../api.js'
import { useAsync } from '../useAsync.js'
import { useLivePoll } from '../useLivePoll.js'
import { Async, Panel } from './ui.jsx'
import { SpoilerGate } from '../FanContext.jsx'
import { clinchingStatus, isCurrentRaceSeason, normalizeRaceStandings, normalizeRemaining, raceColumns } from '../playoffRace.js'
import '../playoff-race.css'

export function PlayoffRace({ team, season }) {
  const state = useAsync(async ({ fresh }) => {
    const results = await Promise.allSettled([
      getStandings(team, season, { level: 3, fresh }),
      getStandings(team, season, { level: 2, fresh }),
      getSchedule(team, season, 2, { fresh }),
    ])
    return { division: results[0], conference: results[1], schedule: results[2] }
  }, [team.key, season])
  useLivePoll(state.refresh, isCurrentRaceSeason(team, season), 60_000)

  return (
    <Panel title={`${team.short} playoff race`}>
      <Async state={state} what="the playoff race" rows={5} isEmpty={(data) => !data} empty="No playoff race data published for this season.">
        {(data) => <RaceContent data={data} team={team} season={season} onRefresh={state.refresh} />}
      </Async>
    </Panel>
  )
}

function RaceContent({ data, team, season, onRefresh }) {
  const division = data.division.status === 'fulfilled' ? normalizeRaceStandings(data.division.value, season) : null
  const conference = data.conference.status === 'fulfilled' ? normalizeRaceStandings(data.conference.value, season) : null
  const schedule = data.schedule.status === 'fulfilled' ? normalizeRemaining(data.schedule.value, team, season) : null
  const divisionGroups = division?.groups ?? []
  const conferenceGroups = conference?.groups ?? []
  const ownDivision = divisionGroups.find((group) => group.rows.some((row) => String(row.id) === String(team.espnId))) ?? null
  const ownConference = conferenceGroups.find((group) => group.rows.some((row) => String(row.id) === String(team.espnId))) ?? null
  const groups = [ownDivision, ownConference].filter(Boolean).filter((group, index, values) => values.findIndex((item) => item.name === group.name) === index)
  const extraGroups = [...divisionGroups, ...conferenceGroups].filter((group) => !groups.some((selected) => selected.name === group.name))
  const mismatch = [division, conference, schedule].some((value) => value?.seasonMismatch)
  return (
    <SpoilerGate scope={`playoffrace:${team.key}:${season}`} label="playoff race">
      <div className="playoff-race">
        <div className="race-tools">
          <span>Standings and schedule are sourced independently.</span>
          <button className="text-button" type="button" onClick={onRefresh}>Refresh</button>
        </div>
        {mismatch ? <p className="state error">The source returned a different season, so those standings are hidden.</p> : null}
        {data.division.status !== 'fulfilled' ? <p className="note">Division standings unavailable.</p> : null}
        {data.conference.status !== 'fulfilled' ? <p className="note">Conference standings unavailable.</p> : null}
        {groups.length === 0 && !mismatch ? <p className="note">No standings groups were returned for this season.</p> : null}
        {groups.map((group, index) => <RaceTable key={`${group.name}-${index}`} group={group} team={team} />)}
        {extraGroups.length ? <details className="race-more"><summary>Other standings groups ({extraGroups.length})</summary>{extraGroups.map((group, index) => <RaceTable key={`${group.name}-extra-${index}`} group={group} team={team} />)}</details> : null}
        {data.schedule.status !== 'fulfilled' ? <p className="note">Remaining schedule unavailable.</p> : null}
        {schedule && !schedule.seasonMismatch ? <Remaining games={schedule.games} /> : null}
        {schedule?.seasonMismatch ? <p className="note">Remaining games hidden because the schedule season did not match.</p> : null}
        <p className="race-note">Seeds are ESPN’s published positions where available. Qualification cutoffs and wild-card tiebreakers are not inferred.</p>
        <div className="race-footer">
          <a href={`https://www.espn.com/${team.league}/standings?season=${season}`} target="_blank" rel="noreferrer">Source: ESPN standings</a>
          {isCurrentRaceSeason(team, season) ? <span>Updates while this tab is visible.</span> : <span>Historical season snapshot.</span>}
        </div>
      </div>
    </SpoilerGate>
  )
}

function RaceTable({ group, team }) {
  const row = group.rows.find((candidate) => String(candidate.id) === String(team.espnId))
  const columns = raceColumns(team, row ?? group.rows[0] ?? { stats: [] })
  const seedAvailable = group.rows.length > 0 && group.rows.every((entry) => numberOrSeed(entry) !== null)
  const orderedRows = seedAvailable ? [...group.rows].sort((a, b) => numberOrSeed(a) - numberOrSeed(b)) : group.rows
  return (
    <section className="race-group">
      <h3>{group.name}</h3>
      <p className="race-ancestry">{group.ancestry.join(' / ')}{columns.some(column => column.key === 'gamesBehind') ? ' · GB is behind this group’s leader.' : ''}{seedAvailable ? ' · Ordered by published seed.' : ' · Source order; no playoff cutoff implied.'}</p>
      <div className="table-wrap"><table><thead><tr><th>Team</th>{columns.map((column) => <th key={column.key}>{column.label}</th>)}<th>Clinching status</th></tr></thead>
        <tbody>{orderedRows.map((entry) => <tr key={entry.id ?? entry.team} className={String(entry.id) === String(team.espnId) ? 'me' : undefined}><th>{entry.team}</th>{columns.map((column) => <td key={column.key}>{entry.stats.find((stat) => stat.key === column.key)?.displayValue ?? '—'}</td>)}<td>{clinchingStatus(entry)}</td></tr>)}</tbody>
      </table></div>
    </section>
  )
}

function numberOrSeed(row) {
  const stat = row.stats.find((item) => item.key === 'playoffSeed' || item.abbreviation === 'SEED')
  const value = Number(stat?.value ?? stat?.displayValue)
  return Number.isFinite(value) && value > 0 ? value : null
}

function Remaining({ games }) {
  return <section className="race-remaining"><h3>Scheduled games remaining <span>{games.length}</span></h3>{games.length ? <ul>{games.map((game) => <li key={game.id ?? game.date}><time dateTime={game.date}>{new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', ...(game.timeTbd ? {} : { hour: 'numeric', minute: '2-digit' }) }).format(new Date(game.date))}{game.timeTbd ? ' · Time TBD' : ' CT'}</time><span>{game.home ? 'vs' : '@'} {game.opponent}</span></li>)}</ul> : <p className="note">No unfinished regular-season games in the source schedule.</p>}</section>
}
