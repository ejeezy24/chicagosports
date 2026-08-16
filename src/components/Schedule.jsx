import { Fragment, memo, useEffect, useId, useMemo, useRef, useState } from 'react'
import { getSchedule, getScoreboard } from '../api.js'
import { scheduleEvents, recordFromGames, scoreboardScores, withLiveScores } from '../espn.js'
import { formatDate, formatTime, isSameDay } from '../format.js'
import { currentSeasonFor, seasonLabel } from '../seasons.js'
import { useAsync } from '../useAsync.js'
import { useLivePoll } from '../useLivePoll.js'
import { downloadCalendar, groupedMonths, initialOpenMonths, reconcileOpenMonths } from '../scheduleTools.js'
import { Async, Panel } from './ui.jsx'
import { Boxscore } from './Boxscore.jsx'
import { Venue } from './Venue.jsx'

export function Schedule({ team, season }) {
  const [seasonType, setSeasonType] = useState(2)
  // A current-season visitor normally wants the latest result or next fixture,
  // not an October game at the bottom of a long list. Older seasons remain a
  // chronological archive by default.
  const [newestFirst, setNewestFirst] = useState(
    () => Number(season) === Number(currentSeasonFor(team)),
  )
  const state = useAsync(
    () => getSchedule(team, season, seasonType),
    [team.key, season, seasonType],
  )

  // Hoisted out of the render prop below: hooks can't run in there, and this is
  // also the normalizer that used to run twice on every render.
  const scheduled = useMemo(
    () => scheduleEvents(state.data, team.espnId),
    [state.data, team.espnId],
  )

  // `state === 'in'` can only be true for the current season, so no season
  // guard is needed here.
  const anyLive = scheduled.some((g) => g.state === 'in')

  // The schedule payload leaves the score out entirely while a game is being
  // played, so a running score has to come from the league scoreboard and be
  // laid over the top. Only fetched while something is actually live.
  const live = useAsync(
    ({ fresh }) => (anyLive ? getScoreboard(team, { fresh }) : Promise.resolve(null)),
    [team.key, anyLive],
  )
  useLivePoll(live.refresh, anyLive)

  const withScores = useMemo(
    () => withLiveScores(scheduled, scoreboardScores(live.data)),
    [scheduled, live.data],
  )

  // Chronological reads like a fixture list; newest-first answers "what just
  // happened?", which is what you want mid-season.
  const games = useMemo(
    () => (newestFirst ? [...withScores].reverse() : withScores),
    [withScores, newestFirst],
  )
  const monthGroups = useMemo(() => groupedMonths(games), [games])
  const [openMonths, setOpenMonths] = useState(new Set())
  const monthStructure = useMemo(() => monthGroups.map((group) => `${group.label}:${group.games.map((game) => game.id ?? game.date).join(',')}`).join('|'), [monthGroups])
  const previousStructure = useRef(null)
  useEffect(() => {
    if (previousStructure.current === monthStructure) return
    const firstLoad = previousStructure.current === null
    previousStructure.current = monthStructure
    setOpenMonths((current) => firstLoad ? initialOpenMonths(monthGroups, new Date()) : reconcileOpenMonths(current, monthGroups))
  }, [monthGroups, monthStructure])
  const toggleMonth = (label) => setOpenMonths((current) => {
    const next = new Set(current)
    if (next.has(label)) next.delete(label)
    else next.add(label)
    return next
  })

  const types = team.seasonTypes
  const hasToday = withScores.some((game) => isSameDay(game.date))
  const jumpToToday = () => {
    document.querySelector('.game.today')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return (
    <Panel
      title={`${seasonLabel(team, season)} schedule`}
      aside={
        <div className="panel-controls">
          {hasToday ? (
            <button className="order-toggle" onClick={jumpToToday}>
              Today
            </button>
          ) : null}
          <button
            className="order-toggle"
            onClick={() => setNewestFirst((v) => !v)}
            aria-pressed={newestFirst}
            title={newestFirst ? 'Showing most recent first' : 'Showing oldest first'}
          >
            <span aria-hidden="true">{newestFirst ? '▼' : '▲'}</span>
            {newestFirst ? 'Newest' : 'Oldest'}
          </button>
          <div className="segmented">
            {types.map((t) => (
              <button
                key={t.id}
                aria-pressed={seasonType === t.id}
                onClick={() => setSeasonType(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      }
    >
      <Async
        state={state}
        what="the schedule"
        isEmpty={() => games.length === 0}
        empty={`No ${types.find((t) => t.id === seasonType)?.label.toLowerCase()} games published for ${seasonLabel(team, season)}.`}
      >
        {() => {
          const record = recordFromGames(games)
          const scored = games.reduce(
            (acc, g) => {
              const us = Number(g.ourScore)
              const them = Number(g.theirScore)
              if (g.completed && Number.isFinite(us) && Number.isFinite(them)) {
                acc.for += us
                acc.against += them
              }
              return acc
            },
            { for: 0, against: 0 },
          )

          return (
            <>
              {state.data?.source ? (
                <div className="schedule-source">
                  Verified historical scores from <a href={state.data.sourceUrl} target="_blank" rel="noreferrer">{state.data.source}</a>. ESPN remains the source for current schedules and game files.
                </div>
              ) : null}
              <div className="summary">
                <div>
                  <span>Record</span>
                  <strong>{record.played ? record.text : '—'}</strong>
                </div>
                <div>
                  <span>Games</span>
                  <strong>{games.length}</strong>
                </div>
                <div>
                  <span>Scored</span>
                  <strong>{record.played ? scored.for : '—'}</strong>
                </div>
                <div>
                  <span>Allowed</span>
                  <strong>{record.played ? scored.against : '—'}</strong>
                </div>
              </div>

              {monthGroups.map((group) => {
                const open = openMonths.has(group.label)
                const groupId = `schedule-month-${group.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
                return (
                  <section className="month-group" key={group.label}>
                    <button className="month month-toggle" aria-expanded={open} aria-controls={groupId} onClick={() => toggleMonth(group.label)}>
                      <span>{group.label}</span>
                      <span>{group.games.length} games {open ? '−' : '+'}</span>
                    </button>
                    <div id={groupId} hidden={!open}>
                      {open ? group.games.map((g) => (
                        <GameRow key={g.id ?? `${g.date}-${g.opponent.abbr}`} game={g} team={team} />
                      )) : null}
                    </div>
                  </section>
                )
              })}
            </>
          )
        }}
      </Async>
    </Panel>
  )
}

/**
 * Memoised because of the live poll: a refresh every thirty seconds would
 * otherwise rebuild all 165 rows to change one score. `withLiveScores` keeps
 * object identity for games it didn't touch, so only the game actually being
 * played re-renders.
 */
const GameRow = memo(function GameRow({ game, team }) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  // Nothing to show for a game that hasn't been played yet.
  const canExpand = game.hasBoxscore !== false && (game.completed || game.state === 'in')
  const scheduled = new Date(game.date)
  const canCalendar = !game.completed && game.state !== 'in' && !game.timeTbd && Number.isFinite(scheduled.getTime())

  // Kept as parts rather than a joined string so the venue can carry its own
  // hover card; away grounds fall back to plain text inside <Venue>.
  const sub = [
    game.week ? `Week ${game.week}` : null,
    game.note,
    game.venue ? <Venue key="venue" name={game.venue} /> : null,
    game.broadcast,
  ].filter(Boolean)

  return (
    <>
    <div className={`game${isSameDay(game.date) ? ' today' : ''}${open ? ' is-open' : ''}`}>
      <div className="g-date">
        {formatDate(game.date)}
        <small>{game.completed ? 'Final' : formatTime(game.date)}</small>
      </div>

      {game.opponent.logo ? (
        <img className="g-logo" src={game.opponent.logo} alt="" loading="lazy" />
      ) : (
        <div className="g-logo" />
      )}

      <div className="g-opp">
        <div className="name">
          <span style={{ color: 'var(--dim)' }}>{game.home ? 'vs' : '@'}</span>{' '}
          {game.opponent.name}
        </div>
        {sub.length ? (
          <div className="sub">
            {sub.map((part, i) => (
              <Fragment key={i}>
                {i ? ' · ' : null}
                {part}
              </Fragment>
            ))}
          </div>
        ) : null}
      </div>

      <div className="g-result">
        {game.state === 'in' ? (
          <>
            <span className="livedot">● {game.detail ?? 'Live'}</span>
            <span className="score">
              {game.ourScore ?? '—'}–{game.theirScore ?? '—'}
            </span>
          </>
        ) : game.completed ? (
          <>
            {game.result ? (
              <span className={`badge ${game.result.toLowerCase()}`}>{game.result}</span>
            ) : null}
            <span className="score">
              {game.ourScore ?? '—'}–{game.theirScore ?? '—'}
            </span>
            {game.record ? (
              <span style={{ color: 'var(--dim)', fontSize: 11.5 }}>{game.record}</span>
            ) : null}
          </>
        ) : (
          <>
            <span className="upcoming">{game.detail ?? formatTime(game.date)}</span>
            {canCalendar ? (
              <button className="calendar-button" onClick={() => downloadCalendar(game, team)} title="Download calendar event">
                <span aria-hidden="true">＋</span>
                <span className="sr-only">Add {team.name} {game.home ? 'vs' : 'at'} {game.opponent.name} to calendar</span>
              </button>
            ) : null}
          </>
        )}
      </div>

      {/* Its own control rather than making the row a button: the row already
          contains the venue's hover card, and buttons can't nest. */}
      {canExpand ? (
        <button
          className="g-toggle"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
        >
          <span aria-hidden="true">{open ? '−' : '+'}</span>
          <span className="sr-only">
            {open ? 'Hide' : 'Show'} boxscore for {game.home ? 'vs' : '@'} {game.opponent.name}
          </span>
        </button>
      ) : (
        <span className="g-toggle is-empty" aria-hidden="true" />
      )}
    </div>

    {open ? (
      <div id={panelId}>
        <Boxscore team={team} eventId={game.id} />
      </div>
    ) : null}
    </>
  )
})
