import { useMemo, useState } from 'react'
import { currentSeasonFor, seasonLabel } from '../seasons.js'
import { isPartialSchedule } from '../coverage.js'
import { useSchedule } from '../useSchedule.js'
import { useFan, SpoilerGate } from '../FanContext.jsx'
import { filterGames, gameKey, isCancelled, seasonSummary } from '../fan.js'
import { calendarGames, downloadCalendar } from '../calendar.js'
import { formatDate, formatTime, isSameDay, monthKey } from '../format.js'
import { Async, Panel } from './ui.jsx'
import { GameCard } from './GameCard.jsx'

const DEFAULT_FILTERS = { opponent: '', location: 'all', day: 'all', status: 'all' }

export function SeasonHeatmap({ team, season, heatmap = false }) {
  const [seasonType, setSeasonType] = useState(2)
  const [newestFirst, setNewestFirst] = useState(() => Number(season) === Number(currentSeasonFor(team)))
  const [filters, setFilters] = useState(DEFAULT_FILTERS)
  const [selectedId, setSelectedId] = useState(null)
  const { state, games } = useSchedule(team, season, seasonType)
  const visibleGames = useMemo(() => filterGames(games, filters), [games, filters])
  const ordered = newestFirst ? [...visibleGames].reverse() : visibleGames
  const partial = isPartialSchedule(team, season)
  const summary = seasonSummary(visibleGames)
  const exportable = calendarGames(visibleGames)
  const opponents = [...new Map(games.map((g) => [String(g.opponent.id ?? g.opponent.name), g.opponent.name])).entries()].sort((a, b) => a[1].localeCompare(b[1]))
  const setFilter = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }))
  const selected = visibleGames.find((g) => gameKey(team, g) === selectedId)
  return <Panel title={`${seasonLabel(team, season)} ${heatmap ? 'season heatmap' : 'schedule'}`}
    note={partial ? 'This archive contains only part of the season. Records and scoring totals are unavailable.' : null}
    aside={<div className="segmented">{team.seasonTypes.map((type) => <button key={type.id} aria-pressed={seasonType === type.id} onClick={() => { setSeasonType(type.id); setFilters(DEFAULT_FILTERS); setSelectedId(null) }}>{type.label}</button>)}</div>}>
    <Async state={state} what="the schedule" isEmpty={() => games.length === 0} empty="No games published for this season and game type.">
      {() => <>
        <div className="filter-bar">
          <label>Opponent<select value={filters.opponent} onChange={(e) => setFilter('opponent', e.target.value)}><option value="">All opponents</option>{opponents.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
          <label>Location<select value={filters.location} onChange={(e) => setFilter('location', e.target.value)}><option value="all">All locations</option><option value="home">Home</option><option value="away">Away</option><option value="neutral">Neutral site</option></select></label>
          <label>Day<select value={filters.day} onChange={(e) => setFilter('day', e.target.value)}><option value="all">Any day</option><option value="weekend">Weekend</option>{['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day, i) => <option value={i} key={day}>{day}</option>)}</select></label>
          <label>Status<select value={filters.status} onChange={(e) => setFilter('status', e.target.value)}><option value="all">All games</option><option value="upcoming">Upcoming</option><option value="completed">Completed</option></select></label>
          <button className="text-button" onClick={() => setFilters(DEFAULT_FILTERS)}>Clear filters</button>
        </div>
        <div className="list-toolbar"><span role="status">{visibleGames.length} of {games.length} games</span><div className="action-row">
          {!heatmap ? <button className="pixel-button" onClick={() => setNewestFirst((v) => !v)}>{newestFirst ? 'Newest first' : 'Oldest first'}</button> : null}
          {visibleGames.some((g) => isSameDay(g.date)) && !heatmap ? <button className="pixel-button" onClick={() => document.querySelector('.today-card')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' })}>Today</button> : null}
          <button className="pixel-button" disabled={!exportable.length} onClick={() => downloadCalendar(team, visibleGames)}>Export {exportable.length} to calendar</button>
        </div></div>
        <p className="micro-note">Calendar downloads include known start times. TBD, postponed and cancelled games are omitted; downloads do not update automatically.</p>
        {visibleGames.length ? <>
          <SpoilerGate scope={`summary:${team.key}:${season}:${seasonType}`} label="season totals"><div className="summary">
            <div><span>Record · filtered games</span><strong>{!partial && summary.played ? summary.record : '—'}</strong></div>
            <div><span>Scored</span><strong>{!partial && summary.played ? summary.scored : '—'}</strong></div>
            <div><span>Allowed</span><strong>{!partial && summary.played ? summary.allowed : '—'}</strong></div>
            {team.league === 'nhl' ? <small>Losses include overtime and shootouts.</small> : null}
          </div></SpoilerGate>
          {heatmap ? <><Heatmap games={visibleGames} team={team} selectedId={selectedId} onSelect={setSelectedId} />{selected ? <GameCard key={gameKey(team, selected)} game={selected} team={team} defaultOpen /> : <p className="state">Choose a tile to open the game and its boxscore.</p>}</>
            : ordered.map((game, index) => <div key={gameKey(team, game)}>{index === 0 || monthKey(game.date) !== monthKey(ordered[index - 1].date) ? <div className="month">{monthKey(game.date)}</div> : null}<GameCard game={game} team={team} /></div>)}
        </> : <div className="state">No games match these filters. Try another opponent or clear the filters.</div>}
      </>}
    </Async>
  </Panel>
}

function Heatmap({ games, team, selectedId, onSelect }) {
  const fan = useFan()
  const months = new Map()
  for (const game of games) { const month = monthKey(game.date); if (!months.has(month)) months.set(month, []); months.get(month).push(game) }
  return <div className="heatmap"><div className="heat-legend"><span className="heat-key w">W · Win</span><span className="heat-key l">L · Loss</span><span className="heat-key t">T · Tie</span><span>○ Upcoming · ? Hidden · — No result</span></div>
    {[...months].map(([month, entries]) => <section key={month}><h3>{month}</h3><div className="heat-grid">{entries.map((game) => {
      const key = gameKey(team, game)
      const visible = fan.visible(key)
      const status = !visible ? '?' : game.state === 'in' ? 'LIVE' : game.completed ? game.result ?? '—' : '○'
      const label = `${formatDate(game.date)} ${game.home ? 'vs' : 'at'} ${game.opponent.name}: ${!visible ? 'result hidden' : game.completed ? `${game.result ?? 'Final'} ${game.ourScore ?? '—'}–${game.theirScore ?? '—'}` : isCancelled(game) ? game.detail : formatTime(game.date) || 'Upcoming'}`
      return <button key={key} className={`heat-tile ${visible ? game.result?.toLowerCase() ?? '' : 'hidden'}`} aria-label={label} title={label} aria-pressed={selectedId === key} onClick={() => onSelect(key)}>{status}</button>
    })}</div></section>)}
  </div>
}
