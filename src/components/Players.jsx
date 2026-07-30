import { useState } from 'react'
import { getPlayerStats } from '../api.js'
import { espnPlayerStats, mlbPlayerStats } from '../players.js'
import { seasonLabel } from '../seasons.js'
import { useAsync } from '../useAsync.js'
import { Async, Panel } from './ui.jsx'

/**
 * Season statistics for every player on the roster, sortable by any column.
 *
 * Baseball and everything else come from different APIs — see players.js — but
 * both arrive here in the same shape.
 */
export function Players({ team, season }) {
  const state = useAsync(() => getPlayerStats(team, season), [team.key, season])

  const groupsFrom = (data) =>
    team.sport === 'baseball' ? mlbPlayerStats(data, team.mlbId) : espnPlayerStats(data)

  return (
    <Panel title={`${seasonLabel(team, season)} player statistics`} aside="Click a column to sort">
      <Async
        state={state}
        what="player statistics"
        rows={5}
        isEmpty={(d) => groupsFrom(d).length === 0}
        empty={`No player statistics published for ${seasonLabel(team, season)}.`}
      >
        {(data) =>
          groupsFrom(data).map((group) => <PlayerGroup key={group.name} group={group} />)
        }
      </Async>
    </Panel>
  )
}

function PlayerGroup({ group }) {
  // null = roster order, which is how the source sent it.
  const [sort, setSort] = useState(null)

  const rows = sortRows(group.rows, sort)

  const toggle = (index) =>
    setSort((prev) =>
      prev?.index === index ? (prev.descending ? { index, descending: false } : null) : { index, descending: true },
    )

  return (
    <>
      <div className="group-title">
        {group.name} · {group.rows.length}
      </div>
      <div className="table-wrap">
        <table className="players-table season">
          <thead>
            <tr>
              <th scope="col">Player</th>
              {group.columns.map((c, i) => (
                <th scope="col" key={`${c}-${i}`} aria-sort={ariaSort(sort, i)}>
                  <button onClick={() => toggle(i)} title={`Sort by ${c}`}>
                    {c}
                    <span aria-hidden="true">{sortMark(sort, i)}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id}>
                <th scope="row">
                  {p.jersey ? <span className="pnum">{p.jersey}</span> : null}
                  <span className="pname">{p.name}</span>
                  {p.position ? <span className="ppos">{p.position}</span> : null}
                </th>
                {p.values.map((v, i) => (
                  <td key={i} className={sort?.index === i ? 'sorted' : undefined}>
                    {v}
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

const ariaSort = (sort, i) =>
  sort?.index === i ? (sort.descending ? 'descending' : 'ascending') : 'none'

const sortMark = (sort, i) => (sort?.index === i ? (sort.descending ? ' ▼' : ' ▲') : '')

/**
 * Sorts numerically where the column is numeric, and alphabetically otherwise.
 * Baseball rates arrive as ".248" and innings as "12.1", so anything that
 * parses as a number is treated as one; missing values sink to the bottom
 * either way rather than sorting as zero.
 */
function sortRows(rows, sort) {
  if (!sort) return rows

  const value = (row) => row.values[sort.index]
  const asNumber = (v) => {
    if (v === undefined || v === null || v === '—' || v === '') return null
    const n = Number(String(v).replace(/,/g, ''))
    return Number.isFinite(n) ? n : null
  }

  return [...rows].sort((a, b) => {
    const av = asNumber(value(a))
    const bv = asNumber(value(b))

    if (av === null && bv === null) return 0
    if (av === null) return 1 // blanks last, whichever way we're sorting
    if (bv === null) return -1
    if (av !== bv) return sort.descending ? bv - av : av - bv

    return String(value(a)).localeCompare(String(value(b)))
  })
}
