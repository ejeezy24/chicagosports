import { useEffect, useMemo, useState } from 'react'
import { getScoreboard } from '../api.js'
import { TEAMS, accentFor } from '../teams.js'
import { cityScoreboardRows, mergeScoreboardRows, scoreboardCache, scoreboardDateKey } from '../today.js'
import { useAsync } from '../useAsync.js'
import { useLivePoll } from '../useLivePoll.js'

const DAYS = [{ offset: -1, label: 'Yesterday' }, { offset: 0, label: 'Today' }, { offset: 1, label: 'Tomorrow' }]

export function TodayBoard({ onSelect }) {
  const [offset, setOffset] = useState(0)
  const dateKey = scoreboardDateKey(new Date(), offset)
  const cached = useMemo(() => scoreboardCache.read(globalThis.localStorage, dateKey), [dateKey])
  const state = useAsync(async ({ fresh }) => {
    const results = await Promise.allSettled(TEAMS.map((team) => getScoreboard(team, { fresh, date: dateKey })))
    const payloads = Object.fromEntries(results.map((result, index) => [TEAMS[index].key, result.status === 'fulfilled' ? result.value : null]))
    if (results.every((result) => result.status === 'rejected')) throw results[0].reason
    return {
      dateKey,
      rows: cityScoreboardRows(payloads, TEAMS),
      successfulTeamKeys: results.flatMap((result, index) => result.status === 'fulfilled' ? [TEAMS[index].key] : []),
      partial: results.some((result) => result.status === 'rejected'),
    }
  }, [dateKey])
  const loaded = state.data?.dateKey === dateKey ? state.data : null
  const rows = useMemo(() => loaded?.partial
    ? mergeScoreboardRows(cached?.rows, loaded.rows, loaded.successfulTeamKeys)
    : loaded?.rows ?? cached?.rows ?? [], [cached, loaded])
  const savedAt = loaded ? state.updatedAt : cached?.savedAt

  useEffect(() => {
    if (loaded) scoreboardCache.write(globalThis.localStorage, dateKey, rows, state.updatedAt)
  }, [dateKey, loaded, rows, state.updatedAt])

  const fastRefresh = Boolean(loaded?.partial || rows.some((row) => row.live))
  useLivePoll(state.refresh, offset === 0, fastRefresh ? 30_000 : 5 * 60_000)

  const status = state.loading && !rows.length
    ? 'Loading games…'
    : state.error
      ? rows.length ? 'Could not refresh — showing saved games.' : 'Could not load the city scoreboard.'
      : loaded?.partial ? 'Some league updates are delayed.'
        : savedAt ? `Updated ${new Date(savedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''
  return (
    <section className="today-board" aria-labelledby="today-heading">
      <div className="today-head">
        <div><span>City scoreboard</span><h2 id="today-heading">Today in Chicago</h2></div>
        <p>Scores and starts across the city.</p>
        <div className="today-days" aria-label="Scoreboard day">
          {DAYS.map((day) => <button key={day.offset} aria-pressed={offset === day.offset} onClick={() => setOffset(day.offset)}>{day.label}</button>)}
        </div>
        <div className="today-status" aria-live="polite">{status}</div>
        {state.error || loaded?.partial ? (
          <button className="today-retry" onClick={state.error ? state.retry : state.refresh}>Retry</button>
        ) : null}
      </div>
      <div className="today-games">
        {rows.length ? rows.map((row) => (
          <button key={`${row.teamKey}-${row.eventId}`} onClick={() => onSelect(row.teamKey)} style={{ '--card-color': accentFor(TEAMS.find((team) => team.key === row.teamKey)) }}>
            <span className={row.live ? 'is-live' : ''}>{row.status}</span>
            <strong>{row.team}</strong>
            <em>{row.detail}</em>
            {row.score ? <b>{row.score}</b> : null}
          </button>
        )) : <p className="today-empty">{state.loading ? 'The city scoreboard is updating.' : `No Chicago games ${DAYS.find((day) => day.offset === offset)?.label.toLowerCase()}.`}</p>}
      </div>
    </section>
  )
}
