import { getStandings } from '../api.js'
import { ownDivisionFirst, standingsGroups } from '../espn.js'
import { seasonLabel } from '../seasons.js'
import { useAsync } from '../useAsync.js'
import { Async, Panel } from './ui.jsx'

// Standings payloads carry a long tail of derived stats; show the ones people
// actually read, in a sensible order, and fall back to whatever is present.
const PREFERRED = [
  'wins',
  'losses',
  'ties',
  'otLosses',
  'winPercent',
  'points',
  'gamesBehind',
  'streak',
  'pointsFor',
  'pointsAgainst',
  'differential',
  'avgPointsFor',
  'avgPointsAgainst',
]

export function Standings({ team, season }) {
  const state = useAsync(() => getStandings(team, season), [team.key, season])

  return (
    <Panel title={`${seasonLabel(team, season)} standings`}>
      <Async
        state={state}
        what="standings"
        rows={4}
        isEmpty={(d) => standingsGroups(d).length === 0}
        empty={`No standings published for ${seasonLabel(team, season)}.`}
      >
        {(data) =>
          ownDivisionFirst(standingsGroups(data), team.espnId).map((group) => (
            <StandingsTable key={group.name} group={group} espnTeamId={team.espnId} />
          ))
        }
      </Async>
    </Panel>
  )
}

function StandingsTable({ group, espnTeamId }) {
  const sample = group.rows[0]?.stats ?? []
  // Do not fill the table with ESPN's opaque derived fields (for example GBP),
  // which vary by league and have produced duplicate games-behind columns.
  const ordered = PREFERRED.map((key) => sample.find((s) => s.key === key)).filter(Boolean)
  const columns = ordered.slice(0, 8)

  return (
    <>
      <div className="group-title">{group.name}</div>
      <div className="table-wrap" role="region" aria-label={`${group.name} standings table`} tabIndex={0}>
        <table>
          <caption className="sr-only">{group.name} standings</caption>
          <thead>
            <tr>
              <th scope="col">Team</th>
              {columns.map((c) => (
                <th scope="col" key={c.key}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {group.rows.map((row) => (
              <tr
                key={row.id ?? row.team}
                className={String(row.id) === String(espnTeamId) ? 'me' : undefined}
              >
                <th scope="row">
                  <div className="tm">
                    {row.logo ? <img src={row.logo} alt="" loading="lazy" /> : null}
                    <span>{row.team}</span>
                  </div>
                </th>
                {columns.map((c) => (
                  <td key={c.key}>
                    {row.stats.find((s) => s.key === c.key)?.value ?? '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
