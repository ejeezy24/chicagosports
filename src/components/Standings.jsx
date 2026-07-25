import { getStandings } from '../api.js'
import { standingsGroups } from '../espn.js'
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
          standingsGroups(data).map((group) => (
            <StandingsTable key={group.name} group={group} espnTeamId={team.espnId} />
          ))
        }
      </Async>
    </Panel>
  )
}

function StandingsTable({ group, espnTeamId }) {
  const sample = group.rows[0]?.stats ?? []
  const ordered = [
    ...PREFERRED.map((key) => sample.find((s) => s.key === key)).filter(Boolean),
    ...sample.filter((s) => !PREFERRED.includes(s.key)),
  ]
  const columns = ordered.slice(0, 8)

  return (
    <>
      <div className="group-title">{group.name}</div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Team</th>
              {columns.map((c) => (
                <th key={c.key}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {group.rows.map((row) => (
              <tr
                key={row.id ?? row.team}
                className={String(row.id) === String(espnTeamId) ? 'me' : undefined}
              >
                <td>
                  <div className="tm">
                    {row.logo ? <img src={row.logo} alt="" loading="lazy" /> : null}
                    <span>{row.team}</span>
                  </div>
                </td>
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
