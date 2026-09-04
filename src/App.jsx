import { useCallback, useEffect, useMemo, useState } from 'react'
import { getTeam } from './api.js'
import { TEAMS, accentFor, teamByKey } from './teams.js'
import { clampSeason, seasonLabel, seasonOptions } from './seasons.js'
import { TABS } from './tabs.js'
import { coverageNote } from './coverage.js'
import { DEFAULT_TEAM, resolveState } from './urlState.js'
import { useUrlSync } from './useUrlSync.js'
import { useAsync } from './useAsync.js'
import { useLivePoll } from './useLivePoll.js'
import { Schedule } from './components/Schedule.jsx'
import { Players } from './components/Players.jsx'
import { Roster } from './components/Roster.jsx'
import { TeamStats } from './components/TeamStats.jsx'
import { Standings } from './components/Standings.jsx'
import { TeamPicker, summarizeTeam } from './components/TeamPicker.jsx'
import { Venue } from './components/Venue.jsx'
import { Archive } from './components/Archive.jsx'
import { TodayBoard } from './components/TodayBoard.jsx'
import { canonicalState } from './meta.js'

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
  const [archiveView, setArchiveView] = useState(initial.archiveView)
  const [seasonType, setSeasonType] = useState(initial.seasonType)
  const [gameId, setGameId] = useState(initial.gameId)
  const [includeOlder, setIncludeOlder] = useState(initial.includeOlder)
  const [playerFocus, setPlayerFocus] = useState(null)

  const scrollToPanel = useCallback((nextTab) => {
    // Wait for React to replace the active panel before moving it into view.
    // This is especially important on phones, where the season dashboard is
    // tall enough that a tab change can otherwise appear to do nothing.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'auto'
          : 'smooth'
        document.getElementById(`panel-${nextTab}`)?.scrollIntoView({ behavior, block: 'start' })
      })
    })
  }, [])

  const selectTab = useCallback((nextTab) => {
    if (nextTab !== 'schedule') {
      setSeasonType(2)
      setGameId(null)
    }
    setTab(nextTab)
    scrollToPanel(nextTab)
  }, [scrollToPanel])

  const moveTab = useCallback(
    (event, index) => {
      const last = TABS.length - 1
      let nextIndex = null
      if (event.key === 'ArrowRight') nextIndex = index === last ? 0 : index + 1
      if (event.key === 'ArrowLeft') nextIndex = index === 0 ? last : index - 1
      if (event.key === 'Home') nextIndex = 0
      if (event.key === 'End') nextIndex = last
      if (nextIndex === null) return

      event.preventDefault()
      const nextTab = TABS[nextIndex].id
      selectTab(nextTab)
      requestAnimationFrame(() => document.getElementById(`tab-${nextTab}`)?.focus())
    },
    [selectTab],
  )

  // Back and forward hand us a fully resolved state; applying it in one go keeps
  // React's batching from letting the effects below see a half-updated triple.
  const restore = useCallback((next) => {
    setTeamKey(next.teamKey)
    setSeason(next.season)
    setTab(next.tab)
    setArchiveView(next.archiveView)
    setSeasonType(next.seasonType)
    setGameId(next.gameId)
    setIncludeOlder(next.includeOlder)
  }, [])

  useUrlSync({ teamKey, season, tab, archiveView, seasonType, gameId, includeOlder }, restore, store.get('cs.team', DEFAULT_TEAM))

  const selectTeam = useCallback((nextTeam) => {
    setGameId(null)
    setTeamKey(nextTeam)
  }, [])

  const selectSeasonType = useCallback((nextType) => {
    setGameId(null)
    setSeasonType(nextType)
  }, [])

  // Carry the chosen year across teams where it exists; clamp where it doesn't.
  useEffect(() => {
    store.set('cs.team', teamKey)
    setSeason((s) => clampSeason(team, s))
    setPlayerFocus(null)
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

  useEffect(() => {
    setPlayerFocus(null)
  }, [season])

  const openPlayer = useCallback((name) => {
    setPlayerFocus(name)
    selectTab('players')
  }, [selectTab])

  const overviewState = useAsync(
    ({ fresh }) =>
      Promise.all(
        TEAMS.map((t) =>
          getTeam(t, { fresh })
            .then((payload) => [t.key, summarizeTeam(payload)])
            .catch(() => [t.key, null]),
        ),
      ).then(Object.fromEntries),
    [],
  )

  // The strip is on screen whichever tab is open, so it polls independently of
  // the schedule panel.
  useLivePoll(
    overviewState.refresh,
    Object.values(overviewState.data ?? {}).some((v) => v?.live),
  )

  const accent = accentFor(team)
  const archiveCoverage = coverageNote(team, season)
  const teamOverview = overviewState.data?.[team.key]

  useEffect(() => {
    const meta = canonicalState({ team, season, tab, archiveView, seasonType, gameId, includeOlder }, window.location.origin)
    document.title = meta.title
    document.querySelector('link[rel="canonical"]')?.setAttribute('href', meta.url)
    document.querySelector('meta[property="og:url"]')?.setAttribute('content', meta.url)
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', meta.title)
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', meta.description)
    document.querySelector('meta[name="description"]')?.setAttribute('content', meta.description)
    document.querySelector('meta[name="twitter:title"]')?.setAttribute('content', meta.title)
    document.querySelector('meta[name="twitter:description"]')?.setAttribute('content', meta.description)
  }, [team, season, tab, archiveView, seasonType, gameId, includeOlder])

  return (
    <div className="app" style={{ '--team': accent }}>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <header className="masthead">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">CS</div>
          <div>
            <div className="eyebrow">All Chicago. Every season.</div>
            <h1>
              <span>Chicago</span> Sports
            </h1>
          </div>
        </div>
        <p>Scores, schedules, rosters, and history for the city&apos;s five major clubs.</p>
      </header>

      <TodayBoard onSelect={selectTeam} />

      <TeamPicker
        selected={team.key}
        onSelect={selectTeam}
        overview={overviewState.data}
      />

      <section className="team-dashboard" aria-label={`${team.name} season controls`}>
        <div className="team-identity">
          <div className="team-crest" aria-hidden="true">
            {teamOverview?.logo ? <img src={teamOverview.logo} alt="" /> : team.abbr}
          </div>
          <div>
            <div className="hero-kicker">{team.leagueLabel} · Chicago</div>
            <h2>{team.short}</h2>
            <div className="hero-venue"><Venue name={team.venue} /></div>
          </div>
        </div>

        <div className="team-glance">
          <div>
            <span>Club snapshot</span>
            <strong>{teamOverview?.record ?? 'Loading current record…'}</strong>
          </div>
          <div>
            <span>Next up</span>
            <strong>{teamOverview?.next ?? 'Schedule updating…'}</strong>
          </div>
        </div>

        <div className="season-controls">
          <div className="field">
            <label htmlFor="season">Season</label>
            <select
              id="season"
              value={season}
              onChange={(e) => {
                setGameId(null)
                setSeason(Number(e.target.value))
              }}
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
            Explore back to {team.oldestSeason}
          </label>
        </div>

        {archiveCoverage ? (
          <div className="coverage" role="status">
            <strong>{archiveCoverage.label}</strong> {archiveCoverage.detail}
          </div>
        ) : null}
      </section>

      <div className="tabs" role="tablist">
        {TABS.map((t, index) => (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            role="tab"
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            aria-label={t.label}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => selectTab(t.id)}
            onKeyDown={(event) => moveTab(event, index)}
          >
            <span className="tab-label-full" aria-hidden="true">{t.label}</span>
            <span className="tab-label-short" aria-hidden="true">{t.shortLabel}</span>
          </button>
        ))}
      </div>

      <main id="main-content">
        <div id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} tabIndex={-1}>
        {/* Keyed so switching team or season remounts panels with clean state. */}
        {tab === 'archive' && (
          <Archive key={`arc-${team.key}-${season}`} team={team} season={season} seasons={seasons} view={archiveView} onViewChange={setArchiveView} />
        )}
        {tab === 'schedule' && (
          <Schedule key={`sch-${team.key}-${season}`} team={team} season={season} seasonType={seasonType} onSeasonTypeChange={selectSeasonType} gameId={gameId} onGameChange={setGameId} />
        )}
        {tab === 'roster' && (
          <Roster key={`ros-${team.key}-${season}`} team={team} season={season} onOpenPlayer={openPlayer} />
        )}
        {tab === 'players' && (
          <Players key={`plr-${team.key}-${season}-${playerFocus ?? ''}`} team={team} season={season} focusName={playerFocus} />
        )}
        {tab === 'stats' && (
          <TeamStats key={`sta-${team.key}-${season}`} team={team} season={season} />
        )}
        {tab === 'standings' && (
          <Standings key={`std-${team.key}-${season}`} team={team} season={season} />
        )}
        </div>
      </main>

      <footer className="foot">
        Data from ESPN, NBA, MLB, the NHL, and nflverse · coverage varies by era · times shown in Chicago time
        <br />
        Unofficial and unaffiliated with ESPN or any club.
        <details className="methodology">
          <summary>About the data</summary>
          <p>Live league feeds power current schedules and statistics. Historical coverage varies by team and season; archive stories and franchise records link to their official sources. Favorites stay in this browser and are not uploaded.</p>
        </details>
      </footer>
    </div>
  )
}
