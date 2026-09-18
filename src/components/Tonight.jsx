import { useState } from 'react'
import { getScoreboard } from '../api.js'
import { normalizeEvent } from '../espn.js'
import { TEAMS } from '../teams.js'
import { dateRange, dayKey, gameKey, shiftDay } from '../fan.js'
import { useChicagoDay } from '../FanContext.jsx'
import { useAsync } from '../useAsync.js'
import { useLivePoll } from '../useLivePoll.js'
import { useGameStart } from '../useSchedule.js'
import { formatDate } from '../format.js'
import { Panel, Async } from './ui.jsx'
import { GameCard } from './GameCard.jsx'

const LEAGUES = TEAMS.filter((team, i) => TEAMS.findIndex((t) => t.league === team.league) === i)

export function Tonight() {
  const today = useChicagoDay()
  const [mode, setMode] = useState('today')
  const [start, end] = dateRange(mode, today)
  const state = useAsync(async ({ fresh }) => {
    const requests = []
    for (let date = start; date <= end; date = shiftDay(date, 1)) {
      for (const team of LEAGUES) requests.push({ team, date })
    }
    const results = await Promise.allSettled(requests.map(({ team, date }) => getScoreboard(team, { fresh, date: date.replaceAll('-', '') })))
    const games = [], failed = []
    results.forEach((result, i) => {
      const league = requests[i].team.league
      if (result.status === 'rejected') { failed.push(requests[i].team.leagueLabel); return }
      for (const event of result.value?.events ?? []) {
        const competitors = event.competitions?.[0]?.competitors ?? []
        // A Crosstown game appears once, from the home Chicago club's perspective.
        const clubs = TEAMS.filter((t) => t.league === league && competitors.some((c) => String(c.team?.id) === t.espnId))
        const team = clubs.find((t) => competitors.some((c) => String(c.team?.id) === t.espnId && c.homeAway === 'home')) ?? clubs[0]
        if (!team) continue
        const game = normalizeEvent(event, team.espnId)
        const day = dayKey(game.date)
        if (day >= start && day <= end) games.push({ team, game, clubs: clubs.map((t) => t.key) })
      }
    })
    return { games: [...new Map(games.map((entry) => [gameKey(entry.team, entry.game), entry])).values()].sort((a, b) => new Date(a.game.date) - new Date(b.game.date)), failed: [...new Set(failed)] }
  }, [start, end])
  const entries = state.data?.games ?? []
  useLivePoll(state.refresh, entries.some(({ game }) => game.state === 'in'))
  useGameStart(state.refresh, entries.map(({ game }) => game))
  const active = new Set(entries.flatMap((entry) => entry.clubs))
  return <Panel title="Chicago Tonight" aside={<button className="pixel-button" onClick={state.refresh}>Refresh scores</button>}>
    <div className="feature-intro"><span className="eyebrow">One city. Every game.</span><h2>Your Chicago watch list.</h2><p>Start times, broadcasts and live scores across all five clubs. All times are in Chicago.</p>
      <div className="segmented">{[['today', 'Today'], ['tomorrow', 'Tomorrow'], ['weekend', 'Weekend']].map(([key, label]) => <button key={key} aria-pressed={mode === key} onClick={() => setMode(key)}>{label}</button>)}</div>
    </div>
    <Async state={state} what="Chicago games">{(data) => <>
      {data.failed.length ? <div className="note" role="status">Couldn’t load {data.failed.join(', ')} games. <button className="text-button" onClick={state.refresh}>Try again</button></div> : null}
      {entries.length ? entries.map(({ team, game }, i) => <div key={gameKey(team, game)}>{i === 0 || dayKey(game.date) !== dayKey(entries[i - 1].game.date) ? <div className="group-title">{formatDate(game.date)}</div> : null}<GameCard team={team} game={game} showTeam /></div>) : <div className="state">{data.failed.length ? 'No games loaded for this window. Some leagues are unavailable.' : 'A quiet window in Chicago. Try tomorrow or the weekend.'}</div>}
      <div className="idle-clubs">{TEAMS.filter((t) => !active.has(t.key)).map((t) => <span key={t.key}>{t.short} · {data.failed.includes(t.leagueLabel) ? 'unavailable' : 'no game scheduled'}</span>)}</div>
    </>}</Async>
  </Panel>
}

