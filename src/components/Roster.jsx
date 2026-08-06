import { useMemo, useState } from 'react'
import { getRoster, isHistorical } from '../api.js'
import { rosterCoach, rosterGroups, rosterSeason } from '../espn.js'
import { mlbRosterGroups, nbaRosterGroups, nflRosterGroups, nhlRosterGroups } from '../players.js'
import { sportsReference } from '../references.js'
import { seasonLabel } from '../seasons.js'
import { useAsync } from '../useAsync.js'
import { Async, Panel } from './ui.jsx'

/** Which league publishes its own history, and what it's called on screen. */
const LEAGUE_SOURCE = {
  baseball: { label: 'MLB', groups: mlbRosterGroups },
  hockey: { label: 'the NHL', groups: nhlRosterGroups },
  football: {
    label: 'nflverse',
    groups: (data, season, team) => nflRosterGroups(data, team.abbr, season),
  },
  basketball: {
    label: 'NBA Stats',
    groups: nbaRosterGroups,
    coach: (data) =>
      data?.coaches?.find((coach) => !coach.IS_ASSISTANT)?.COACH_NAME ??
      data?.coaches?.find(Boolean)?.COACH_NAME ??
      null,
  },
}

export function Roster({ team, season }) {
  const [query, setQuery] = useState('')
  const state = useAsync(() => getRoster(team, season), [team.key, season])

  // Past seasons come from league/archive APIs in different payload shapes;
  // see getRoster. The adapters make all four sports look the same here.
  const source = isHistorical(team, season) ? LEAGUE_SOURCE[team.sport] : null

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
        isEmpty={(d) => groupsFor(d, team, season, source).length === 0}
        empty={
          source
            ? `No ${seasonLabel(team, season)} roster was returned by ${source.label}.`
            : isHistorical(team, season)
            ? `ESPN doesn't publish ${team.leagueLabel} rosters for past seasons, so there is no ${seasonLabel(team, season)} squad to show. Its endpoints either come back empty or return today's roster, which would be worse than nothing.`
            : `No roster published for ${seasonLabel(team, season)}.`
        }
      >
        {(data) => (
          <RosterBody
            data={data}
            team={team}
            season={season}
            query={query}
            source={source}
          />
        )}
      </Async>
    </Panel>
  )
}

const groupsFor = (data, team, season, source) =>
  source ? source.groups(data, season, team) : rosterGroups(data)

function RosterBody({ data, team, season, query, source }) {
  const groups = useMemo(
    () => groupsFor(data, team, season, source),
    [data, team, season, source],
  )
  // MLB's payload is season-scoped by construction, so only ESPN's can disagree.
  const returned = source ? null : rosterSeason(data)
  const coach = source ? source.coach?.(data) : rosterCoach(data)
  const reference = source ? sportsReference(team, season) : null

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
      {(mismatch || coach || source) && (
        <div className="note">
          {source
            ? `The ${seasonLabel(team, season)} squad, from ${source.label} — ESPN doesn't publish past rosters. `
            : ''}
          {mismatch
            ? `ESPN returned its ${returned.label ?? returned.year} roster — historical rosters aren't published for every league, so this may not be the ${seasonLabel(team, season)} squad. `
            : ''}
          {coach ? `Head coach/manager: ${coach}. ` : ''}
          {reference ? (
            <a href={reference.url} target="_blank" rel="noreferrer">
              Cross-check this season on {reference.label}
            </a>
          ) : null}
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
    // Baseball reports both hands; hockey reports the one that matters.
    p.bats && p.throws ? `B/T ${p.bats}/${p.throws}` : p.throws ? `Shoots ${p.throws}` : null,
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
