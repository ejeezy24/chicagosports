import { Fragment, memo, useEffect, useId, useMemo, useRef, useState } from 'react'
import { getSchedule, getScoreboard } from '../api.js'
import { scheduleEvents, recordFromGames, scoreboardScores, withLiveScores } from '../espn.js'
import { formatDate, formatTime, isSameDay } from '../format.js'
import { currentSeasonFor, seasonLabel } from '../seasons.js'
import { useAsync } from '../useAsync.js'
import { useLivePoll } from '../useLivePoll.js'
import { calendarSchedule, downloadCalendar, downloadSchedule, groupedMonths, initialOpenMonths, reconcileOpenMonths } from '../scheduleTools.js'
import { gameLink } from '../urlState.js'
import { copyText } from '../share.js'
import { useFan, SpoilerGate } from '../FanContext.jsx'
import { filterGames, gameKey } from '../fan.js'
import { isPartialSchedule } from '../coverage.js'
import { calendarGames, downloadCalendar as exportCalendar } from '../calendar.js'
import { useGameStart } from '../useSchedule.js'
import { TicketEditor } from './GameCard.jsx'
import { ScheduleFilters, DEFAULT_FILTERS } from './ScheduleFilters.jsx'
import { previewDetails } from '../gameDay.js'
import { Async, Panel } from './ui.jsx'
import { Boxscore } from './Boxscore.jsx'
import { Venue } from './Venue.jsx'

export function Schedule({ team, season, seasonType, onSeasonTypeChange, gameId, onGameChange }) {
  // A current-season visitor normally wants the latest result or next fixture,
  // not an October game at the bottom of a long list. Older seasons remain a
  // chronological archive by default.
  const [newestFirst, setNewestFirst] = useState(
    () => Number(season) === Number(currentSeasonFor(team)),
  )
  const state = useAsync(
    ({ fresh }) => getSchedule(team, season, seasonType, { fresh }),
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
  useGameStart(state.refresh, withScores)
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const filtered = useMemo(() => filterGames(withScores, filters), [withScores, filters])
  const exportable = calendarGames(filtered)
  const partial = isPartialSchedule(team, season)
  const hasUpcomingCalendar = useMemo(() => Boolean(calendarSchedule(withScores, team)), [team, withScores])

  // Chronological reads like a fixture list; newest-first answers "what just
  // happened?", which is what you want mid-season.
  const games = useMemo(
    () => (newestFirst ? [...filtered].reverse() : filtered),
    [filtered, newestFirst],
  )
  const monthGroups = useMemo(() => groupedMonths(games), [games])
  const [openMonths, setOpenMonths] = useState(new Set())
  const monthStructure = useMemo(() => monthGroups.map((group) => `${group.label}:${group.games.map((game) => game.id ?? game.date).join(',')}`).join('|'), [monthGroups])
  const previousStructure = useRef(null)
  useEffect(() => {
    if (previousStructure.current === monthStructure) return
    const firstLoad = previousStructure.current === null
    previousStructure.current = monthStructure
    setOpenMonths((current) => firstLoad || filters !== DEFAULT_FILTERS ? initialOpenMonths(monthGroups, new Date(), gameId) : reconcileOpenMonths(current, monthGroups))
  }, [gameId, monthGroups, monthStructure, filters])

  useEffect(() => {
    if (!gameId) return
    const group = monthGroups.find((entry) => entry.games.some((game) => String(game.id) === String(gameId)))
    if (group) setOpenMonths((current) => current.has(group.label) ? current : new Set([...current, group.label]))
  }, [gameId, monthGroups])

  useEffect(() => {
    if (!state.data || !gameId) return
    const selected = withScores.find((game) => String(game.id) === String(gameId))
    if (!selected) onGameChange(null)
  }, [gameId, onGameChange, state.data, withScores])
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
          {hasUpcomingCalendar ? (
            <button
              className="order-toggle schedule-calendar"
              aria-label={`Add ${team.name} upcoming schedule to calendar`}
              onClick={() => downloadSchedule(withScores, team)}
            >
              ＋ Calendar
            </button>
          ) : null}
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
                onClick={() => onSeasonTypeChange(t.id)}
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
        isEmpty={() => withScores.length === 0}
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
              <ScheduleFilters games={withScores} filters={filters} setFilters={setFilters} />
              <div className="list-toolbar"><span role="status">{games.length} of {withScores.length} games</span><button className="pixel-button" disabled={!exportable.length} onClick={() => exportCalendar(team, filtered)}>Export {exportable.length} to calendar</button></div>
              <p className="micro-note">Calendar downloads include known start times; TBD, postponed and cancelled games are omitted. Downloads do not update automatically.</p>
              {!games.length ? <div className="state">No games match these filters. Try another opponent or clear the filters.</div> : null}
              {partial ? <p className="note">Partial archive: season totals are unavailable.</p> : null}
              {state.data?.source ? (
                <div className="schedule-source">
                  Verified historical scores from <a href={state.data.sourceUrl} target="_blank" rel="noreferrer">{state.data.source}</a>. ESPN remains the source for current schedules and game files.
                </div>
              ) : null}
              <SpoilerGate scope={`summary:${team.key}:${season}:${seasonType}`} label="season totals"><div className="summary">
                <div>
                  <span>Record</span>
                  <strong>{!partial && record.played ? record.text : '—'}</strong>
                </div>
                <div>
                  <span>Games</span>
                  <strong>{games.length}</strong>
                </div>
                <div>
                  <span>Scored</span>
                  <strong>{!partial && record.played ? scored.for : '—'}</strong>
                </div>
                <div>
                  <span>Allowed</span>
                  <strong>{!partial && record.played ? scored.against : '—'}</strong>
                </div>
              </div></SpoilerGate>

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
                        <GameRow key={g.id ?? `${g.date}-${g.opponent.abbr}`} game={g} team={team} selected={String(g.id) === String(gameId)} onGameChange={onGameChange} />
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
const GameRow = memo(function GameRow({ game, team, selected, onGameChange }) {
  const fan = useFan()
  const ticketKey = gameKey(team, game)
  const visible = fan.visible(ticketKey)
  const [editing, setEditing] = useState(false)
  const panelId = useId()
  const [copyStatus, setCopyStatus] = useState('idle')
  const copyRequest = useRef(0)
  useEffect(() => () => {
    copyRequest.current += 1
  }, [])
  const rowRef = useRef(null)
  const hasBoxscore = game.hasBoxscore !== false && (game.completed || game.state === 'in')
  const preview = !game.completed && game.state !== 'in' && game.state !== 'post' ? previewDetails(game, team) : null
  const canExpand = Boolean(game.id && (hasBoxscore || preview))
  const open = canExpand && selected
  const canCalendar = Boolean(preview?.canCalendar)
  useEffect(() => {
    if (open) rowRef.current?.scrollIntoView({ behavior: 'auto', block: 'start' })
  }, [open])
  const copyGameLink = async () => {
    const link = gameLink(window.location.href, game.id)
    if (!link) return setCopyStatus('failed')
    const request = ++copyRequest.current
    setCopyStatus('idle')
    const result = await copyText(link, {}, () => request === copyRequest.current)
    if (request === copyRequest.current && result) setCopyStatus(result)
  }
  const copied = copyStatus === 'copied'
  const copyLabel = copied
    ? 'Game link copied'
    : copyStatus === 'manual' ? 'Game link opened for manual copy'
      : copyStatus === 'failed' ? 'Could not copy game link' : 'Copy game link'

  // Kept as parts rather than a joined string so the venue can carry its own
  // hover card; away grounds fall back to plain text inside <Venue>.
  const sub = [
    game.week ? `Week ${game.week}` : null,
    visible ? game.note : null,
    game.venue ? <Venue key="venue" name={game.venue} /> : null,
    game.broadcast,
  ].filter(Boolean)

  return (
    <>
    <div ref={rowRef} className={`game${isSameDay(game.date) ? ' today' : ''}${open ? ' is-open' : ''}`}>
      <div className="g-date">
        {formatDate(game.date)}
        <small>{game.completed ? 'Final' : game.timeTbd ? 'Time TBD' : formatTime(game.date)}</small>
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
        {!visible && (game.completed || game.state === 'in') ? (
          <button className="pixel-button" onClick={() => fan.reveal(ticketKey)}>Reveal score</button>
        ) : game.state === 'in' ? (
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
            <span className="upcoming">{preview?.status}</span>
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
          onClick={() => { if (!open) fan.reveal(ticketKey); onGameChange(open ? null : String(game.id)) }}
        >
          <span aria-hidden="true">{open ? '−' : '+'}</span>
          <span className="sr-only">
            {open ? 'Hide' : 'Show'} {hasBoxscore ? 'boxscore' : 'game preview'} for {game.home ? 'vs' : '@'} {game.opponent.name}
          </span>
        </button>
      ) : (
        <span className="g-toggle is-empty" aria-hidden="true" />
      )}
    </div>

    <div className="game-actions schedule-ticket-actions"><button className="text-button" aria-expanded={editing} onClick={() => setEditing((value) => !value)}>{fan.tickets[ticketKey] ? '★ Edit ticket' : '+ Collect ticket'}</button></div>
    {editing ? <TicketEditor team={team} game={game} onClose={() => setEditing(false)} /> : null}
    {open ? (
      <div id={panelId}>
        <div className="game-detail-tools">
          <span>Shareable game details</span>
          <button className="game-link-button" onClick={copyGameLink} aria-label={copyLabel}>
            {copied ? '✓ Copied' : copyStatus === 'manual' ? 'Copy shown' : copyStatus === 'failed' ? 'Try again' : '↗ Copy link'}
          </button>
        </div>
        {hasBoxscore ? <SpoilerGate scope={ticketKey} label="boxscore"><Boxscore team={team} eventId={game.id} live={game.state === 'in'} /></SpoilerGate> : (
          <section className="game-preview" aria-label="Game preview">
            <h3>{preview.matchup}</h3>
            <p>{preview.dateTime} · Chicago time</p>
            {preview.status ? <p>{preview.status}</p> : null}
            <dl>
              <div><dt>Venue</dt><dd>{preview.venue}</dd></div>
              <div><dt>Broadcast</dt><dd>{preview.broadcast}</dd></div>
            </dl>
            <p className="preview-note">Broadcast listed by the provider; availability and local restrictions may vary.</p>
            {canCalendar ? <button className="order-toggle" onClick={() => downloadCalendar(game, team)}>Add this game to calendar</button> : null}
          </section>
        )}
      </div>
    ) : null}
    </>
  )
})
