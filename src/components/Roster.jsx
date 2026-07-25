import { useMemo, useState } from 'react'
import { getRoster } from '../api.js'
import { rosterCoach, rosterGroups, rosterSeason } from '../espn.js'
import { seasonLabel } from '../seasons.js'
import { useAsync } from '../useAsync.js'
import { Async, Panel } from './ui.jsx'

export function Roster({ team, season }) {
  const [query, setQuery] = useState('')
  const state = useAsync(() => getRoster(team, season), [team.key, season])

  return (
    <Panel
      title="Roster"
      aside={
        <input
          className="roster-search"
          type="search"
          placeholder="Filter players…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Filter players"
        />
      }
    >
      <Async
        state={state}
        what="the roster"
        isEmpty={(d) => rosterGroups(d).length === 0}
        empty={`No roster published for ${seasonLabel(team, season)}.`}
      >
        {(data) => <RosterBody data={data} team={team} season={season} query={query} />}
      </Async>
    </Panel>
  )
}

function RosterBody({ data, team, season, query }) {
  const groups = useMemo(() => rosterGroups(data), [data])
  const returned = rosterSeason(data)
  const coach = rosterCoach(data)

  const needle = query.trim().toLowerCase()
  const filtered = groups
    .map((g) => ({
      ...g,
      athletes: needle
        ? g.athletes.filter(
            (a) =>
              a.name.toLowerCase().includes(needle) ||
              (a.position ?? '').toLowerCase().includes(needle) ||
              (a.college ?? '').toLowerCase().includes(needle) ||
              String(a.jersey ?? '').includes(needle),
          )
        : g.athletes,
    }))
    .filter((g) => g.athletes.length > 0)

  const total = filtered.reduce((n, g) => n + g.athletes.length, 0)

  // ESPN honours the season parameter for some leagues and silently returns the
  // current roster for others. Say which one we actually got.
  const mismatch = returned?.year && Number(returned.year) !== Number(season)

  return (
    <>
      {(mismatch || coach) && (
        <div className="note">
          {mismatch
            ? `ESPN returned its ${returned.label ?? returned.year} roster — historical rosters aren't published for every league, so this may not be the ${seasonLabel(team, season)} squad. `
            : ''}
          {coach ? `Head coach/manager: ${coach}.` : ''}
        </div>
      )}

      {total === 0 ? (
        <div className="state">No players match “{query}”.</div>
      ) : (
        filtered.map((group) => (
          <div key={group.label}>
            <div className="group-title">
              {group.label} · {group.athletes.length}
            </div>
            <div className="players">
              {group.athletes.map((a) => (
                <PlayerCard key={a.id ?? `${a.name}-${a.jersey}`} player={a} />
              ))}
            </div>
          </div>
        ))
      )}
    </>
  )
}

const initials = (name) =>
  String(name)
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase() || '—'

function PlayerCard({ player: p }) {
  const line = [
    p.position,
    p.height,
    p.weight,
    p.age ? `${p.age} yrs` : null,
    p.bats && p.throws ? `B/T ${p.bats}/${p.throws}` : null,
    p.college,
    p.birthplace,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="player">
      {p.headshot ? (
        <img className="shot" src={p.headshot} alt="" loading="lazy" />
      ) : (
        <div className="no">{initials(p.name)}</div>
      )}
      <div className="who">
        <b>
          {p.jersey ? (
            <span style={{ color: 'var(--dim)', fontWeight: 500 }}>#{p.jersey} </span>
          ) : null}
          {p.name}
        </b>
        <span title={line}>{line || '—'}</span>
      </div>
    </div>
  )
}
