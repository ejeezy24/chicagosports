import { Fragment, useId, useState } from 'react'
import { getSchedule } from '../api.js'
import { scheduleEvents, recordFromGames } from '../espn.js'
import { formatDate, formatTime, isSameDay, monthKey } from '../format.js'
import { seasonLabel } from '../seasons.js'
import { useAsync } from '../useAsync.js'
import { Async, Panel } from './ui.jsx'
import { Boxscore } from './Boxscore.jsx'
import { Venue } from './Venue.jsx'

export function Schedule({ team, season }) {
  const [seasonType, setSeasonType] = useState(2)
  const state = useAsync(
    () => getSchedule(team, season, seasonType),
    [team.key, season, seasonType],
  )

  const types = team.seasonTypes

  return (
    <Panel
      title={`${seasonLabel(team, season)} schedule`}
      aside={
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
      }
    >
      <Async
        state={state}
        what="the schedule"
        isEmpty={(d) => scheduleEvents(d, team.espnId).length === 0}
        empty={`No ${types.find((t) => t.id === seasonType)?.label.toLowerCase()} games published for ${seasonLabel(team, season)}.`}
      >
        {(data) => {
          const games = scheduleEvents(data, team.espnId)
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

          let month = null
          return (
            <>
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

              {games.map((g) => {
                const header = monthKey(g.date)
                const showHeader = header !== month
                month = header
                return (
                  <div key={g.id ?? `${g.date}-${g.opponent.abbr}`}>
                    {showHeader ? <div className="month">{header}</div> : null}
                    <GameRow game={g} team={team} />
                  </div>
                )
              })}
            </>
          )
        }}
      </Async>
    </Panel>
  )
}

function GameRow({ game, team }) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  // Nothing to show for a game that hasn't been played yet.
  const canExpand = game.completed || game.state === 'in'

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
          <span className="upcoming">{game.detail ?? formatTime(game.date)}</span>
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
}
