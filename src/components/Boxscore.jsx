import { getSummary } from '../api.js'
import { boxscore } from '../espn.js'
import { useAsync } from '../useAsync.js'
import { Async } from './ui.jsx'

/**
 * One game opened up: the line score by inning, quarter or period, then each
 * team's statistics next to the other's.
 *
 * Fetched only when a row is expanded — a season is 160-odd games and nobody
 * needs 160 summaries to read a schedule.
 */
export function Boxscore({ team, eventId }) {
  const state = useAsync(() => getSummary(team, eventId), [team.key, eventId])

  return (
    <div className="boxscore">
      <Async
        state={state}
        what="the boxscore"
        rows={2}
        isEmpty={(d) => !boxscore(d, team.espnId, team.sport)}
        empty="No boxscore published for this game."
      >
        {(data) => {
          const box = boxscore(data, team.espnId, team.sport)
          return (
            <>
              <LineScore box={box} />
              {box.statGroups.length > 0 ? <StatComparison box={box} /> : null}
              {box.info ? <GameInfo info={box.info} /> : null}
            </>
          )
        }}
      </Async>
    </div>
  )
}

function LineScore({ box }) {
  return (
    <div className="table-wrap">
      <table className="linescore">
        <thead>
          <tr>
            <th scope="col">Team</th>
            {box.periodLabels.map((label, i) => (
              <th scope="col" key={`${label}-${i}`}>
                {label}
              </th>
            ))}
            <th scope="col" className="tot">
              {box.hasHitsErrors ? 'R' : 'T'}
            </th>
            {box.hasHitsErrors ? (
              <>
                <th scope="col" className="tot">
                  H
                </th>
                <th scope="col" className="tot">
                  E
                </th>
              </>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {box.rows.map((row) => (
            <tr key={row.id ?? row.abbr} className={row.isUs ? 'me' : undefined}>
              <th scope="row">
                <div className="tm">
                  {row.logo ? <img src={row.logo} alt="" loading="lazy" /> : null}
                  <span>{row.name}</span>
                </div>
              </th>
              {row.scores.map((s, i) => (
                <td key={i}>{s}</td>
              ))}
              <td className={`tot${row.winner ? ' won' : ''}`}>{row.total}</td>
              {box.hasHitsErrors ? (
                <>
                  <td className="tot">{row.hits ?? '—'}</td>
                  <td className="tot">{row.errors ?? '—'}</td>
                </>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function StatComparison({ box }) {
  const [us, them] = [box.rows.find((r) => r.isUs), box.rows.find((r) => !r.isUs)]

  return (
    <div className="box-stats">
      {box.statGroups.map((group) => (
        <div className="box-group" key={group.name}>
          <h4>
            {group.name}
            <span>
              {us?.abbr ?? 'CHI'} · {them?.abbr ?? 'OPP'}
            </span>
          </h4>
          {group.stats.map((s) => (
            <div className="box-row" key={s.key}>
              <div className="lbl" title={s.label}>
                {s.label}
              </div>
              <div className="ours">{s.us}</div>
              <div className="theirs">{s.them ?? '—'}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function GameInfo({ info }) {
  const parts = [
    info.venue,
    info.attendance ? `${info.attendance} in attendance` : null,
    info.duration ? `${info.duration} elapsed` : null,
  ].filter(Boolean)

  if (parts.length === 0) return null
  return <div className="box-info">{parts.join(' · ')}</div>
}
