import { useCallback, useEffect, useMemo, useState } from 'react'
import { getTeam } from './api.js'
import { TEAMS, accentFor, teamByKey } from './teams.js'
import { clampSeason, seasonLabel, seasonOptions } from './seasons.js'
import { TABS } from './tabs.js'
import { DEFAULT_TEAM, resolveState } from './urlState.js'
import { useUrlSync } from './useUrlSync.js'
import { useAsync } from './useAsync.js'
import { Schedule } from './components/Schedule.jsx'
import { Players } from './components/Players.jsx'
import { Roster } from './components/Roster.jsx'
import { TeamStats } from './components/TeamStats.jsx'
import { Standings } from './components/Standings.jsx'
import { TeamPicker, summarizeTeam } from './components/TeamPicker.jsx'
import { Venue } from './components/Venue.jsx'

const store = {
  get(key, fallback) {
    try {
      return window.localStorage.getItem(key) ?? fallback
    } catch {
      return fallback
    }
  },
  set(key, value) {
    try {
      window.localStorage.setItem(key, value)
    } catch {
      /* private mode — not worth surfacing */
    }
  },
}

export default function App() {
  // Resolved once, before any state exists, so a deep link paints straight away
  // rather than flashing the default view. See urlState.js for why
  // `includeOlder` is derived from the season rather than taken at face value —
  // it is what stops the effect below from undoing a link to an old year.
  const [initial] = useState(() =>
    resolveState(window.location.search, store.get('cs.team', DEFAULT_TEAM)),
  )

  const [teamKey, setTeamKey] = useState(initial.teamKey)
  const team = teamByKey(teamKey)

  const [season, setSeason] = useState(initial.season)
  const [tab, setTab] = useState(initial.tab)
  const [includeOlder, setIncludeOlder] = useState(initial.includeOlder)

  // Back and forward hand us a fully resolved state; applying it in one go keeps
  // React's batching from letting the effects below see a half-updated triple.
  const restore = useCallback((next) => {
    setTeamKey(next.teamKey)
    setSeason(next.season)
    setTab(next.tab)
    setIncludeOlder(next.includeOlder)
  }, [])

  useUrlSync({ teamKey, season, tab, includeOlder }, restore, store.get('cs.team', DEFAULT_TEAM))

  // Carry the chosen year across teams where it exists; clamp where it doesn't.
  useEffect(() => {
    store.set('cs.team', teamKey)
    setSeason((s) => clampSeason(team, s))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamKey])

  const seasons = useMemo(
    () => seasonOptions(team, { includeOlder }),
    [team, includeOlder],
  )

  // If the user was looking at an older season and unticks the box, snap back.
  useEffect(() => {
    if (!seasons.includes(season)) setSeason(seasons[0])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasons])

  const overviewState = useAsync(
    () =>
      Promise.all(
        TEAMS.map((t) =>
          getTeam(t)
            .then((payload) => [t.key, summarizeTeam(payload)])
            .catch(() => [t.key, null]),
        ),
      ).then(Object.fromEntries),
    [],
  )

  const accent = accentFor(team)

  return (
    <div className="app" style={{ '--team': accent }}>
      <header className="masthead">
        <div>
          <h1>
            <span>Chicago</span> Sports
          </h1>
          <p>Schedules, scores, rosters, and stats for all five clubs — pick a season.</p>
        </div>
      </header>

      <TeamPicker
        selected={team.key}
        onSelect={setTeamKey}
        overview={overviewState.data}
      />

      <div className="controls">
        <div className="field">
          <label htmlFor="season">Season</label>
          <select
            id="season"
            value={season}
            onChange={(e) => setSeason(Number(e.target.value))}
          >
            {seasons.map((s) => (
              <option key={s} value={s}>
                {seasonLabel(team, s)}
              </option>
            ))}
          </select>
        </div>

        <label className="check">
          <input
            type="checkbox"
            checked={includeOlder}
            onChange={(e) => setIncludeOlder(e.target.checked)}
          />
          Show seasons back to {team.oldestSeason}
        </label>

        <div className="spacer" />

        <div className="field">
          <span className="tc-league">
            <Venue name={team.venue} />
          </span>
        </div>
      </div>

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <main>
        {/* Keyed so switching team or season remounts panels with clean state. */}
        {tab === 'schedule' && (
          <Schedule key={`sch-${team.key}-${season}`} team={team} season={season} />
        )}
        {tab === 'roster' && (
          <Roster key={`ros-${team.key}-${season}`} team={team} season={season} />
        )}
        {tab === 'players' && (
          <Players key={`plr-${team.key}-${season}`} team={team} season={season} />
        )}
        {tab === 'stats' && (
          <TeamStats key={`sta-${team.key}-${season}`} team={team} season={season} />
        )}
        {tab === 'standings' && (
          <Standings key={`std-${team.key}-${season}`} team={team} season={season} />
        )}
      </main>

      <footer className="foot">
        Data from ESPN&apos;s public endpoints · times shown in Chicago time
        <br />
        Unofficial and unaffiliated with ESPN or any club.
      </footer>
    </div>
  )
}
