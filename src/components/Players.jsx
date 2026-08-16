import { useState } from 'react'
import { getPlayerStats, getRoster, usesArchiveData } from '../api.js'
import { rosterGroups } from '../espn.js'
import {
  espnPlayerStats,
  mlbRosterGroups,
  mlbPlayerStats,
  nbaRosterGroups,
  nbaPlayerStats,
  nflRosterGroups,
  nflPlayerStats,
  nhlRosterGroups,
  nhlPlayerStats,
} from '../players.js'
import { sportsReference } from '../references.js'
import { seasonLabel } from '../seasons.js'
import { useAsync } from '../useAsync.js'
import { Async, Panel } from './ui.jsx'
import { findPlayerBio, PlayerProfile, samePlayer } from './PlayerProfile.jsx'

/**
 * Season statistics for every player on the roster, sortable by any column.
 *
 * Baseball and everything else come from different APIs — see players.js — but
 * both arrive here in the same shape.
 */
export function Players({ team, season, focusName }) {
  const [selected, setSelected] = useState(() => focusName ? { name: focusName } : null)
  const state = useAsync(async () => {
    const [stats, roster] = await Promise.allSettled([
      getPlayerStats(team, season),
      getRoster(team, season),
    ])
    if (stats.status === 'rejected') throw stats.reason
    return { stats: stats.value, roster: roster.status === 'fulfilled' ? roster.value : null }
  }, [team.key, season])

  const past = usesArchiveData(team, season)

  const groupsFrom = (data) => {
    if (team.sport === 'baseball') return mlbPlayerStats(data, team.mlbId)
    if (team.sport === 'hockey' && past) return nhlPlayerStats(data)
    if (team.sport === 'football' && past) return nflPlayerStats(data, team.abbr)
    if (team.sport === 'basketball' && past) return nbaPlayerStats(data)
    return espnPlayerStats(data)
  }

  const archiveSource = past
    ? {
        baseball: 'MLB StatsAPI',
        hockey: 'the NHL',
        football: Number(season) >= 1999 ? 'nflverse' : null,
        basketball: 'NBA Stats / verified season archive',
      }[team.sport]
    : null
  const reference = past ? sportsReference(team, season) : null
  const beforeNflStats = past && team.sport === 'football' && Number(season) < 1999

  return (
    <Panel
      title={`${seasonLabel(team, season)} player statistics`}
      aside="Click a column to sort"
      note={
        past ? (
          <>
            {archiveSource
              ? `Season-specific totals from ${archiveSource}. `
              : 'nflverse season player totals begin in 1999. '}
            {reference ? (
              <a href={reference.url} target="_blank" rel="noreferrer">
                Cross-check this season on {reference.label}
              </a>
            ) : null}
          </>
        ) : null
      }
    >
      <Async
        state={state}
        what="player statistics"
        rows={5}
        isEmpty={(d) => groupsFrom(d.stats).length === 0}
        empty={
          beforeNflStats
            ? `Season-specific Bears player totals are unavailable before 1999. The roster, schedule, scores, team stats, and standings are still historical.`
            : `No player statistics published for ${seasonLabel(team, season)}.`
        }
      >
        {(data) => {
          const groups = groupsFrom(data.stats)
          const roster = rosterGroupsFrom(data.roster, team, season, past)
          const resolved = selected
            ? groups.flatMap((group) => group.rows).find((player) => samePlayer(player, selected)) ?? selected
            : null
          return (
            <>
              <div className="stats-directory">
                <span>{new Set(groups.flatMap((group) => group.rows.map((player) => player.name))).size} players in this season file</span>
                <span>Choose any name for a full player card</span>
              </div>
              {resolved ? (
                <PlayerProfile
                  team={team}
                  season={season}
                  player={resolved}
                  bio={findPlayerBio(roster, resolved)}
                  groups={groups}
                  onClose={() => setSelected(null)}
                />
              ) : null}
              {groups.map((group) => (
                <PlayerGroup key={group.name} group={group} selected={resolved} onSelect={setSelected} />
              ))}
            </>
          )
        }}
      </Async>
    </Panel>
  )
}

function rosterGroupsFrom(data, team, season, past) {
  if (!data) return []
  if (!past) return rosterGroups(data)
  if (team.sport === 'baseball') return mlbRosterGroups(data, season)
  if (team.sport === 'hockey') return nhlRosterGroups(data, season)
  if (team.sport === 'football') return nflRosterGroups(data, team.abbr, season)
  if (team.sport === 'basketball') return nbaRosterGroups(data)
  return []
}

function PlayerGroup({ group, selected, onSelect }) {
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
              <tr key={p.id} className={selected && samePlayer(p, selected) ? 'profile-selected' : undefined}>
                <th scope="row">
                  {p.jersey ? <span className="pnum">{p.jersey}</span> : null}
                  <button className="player-name-button" onClick={() => onSelect(p)}>{p.name}</button>
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
