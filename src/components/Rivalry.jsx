import { useState } from 'react'
import { useSchedule } from '../useSchedule.js'
import { seasonLabel } from '../seasons.js'
import { isPartialSchedule } from '../coverage.js'
import { SpoilerGate } from '../FanContext.jsx'
import { gameKey, isCancelled, scoredGames, seasonSummary } from '../fan.js'
import { Panel, Async } from './ui.jsx'
import { GameCard } from './GameCard.jsx'

export function Rivalry({ team, season }) {
  const { state, games } = useSchedule(team, season)
  const crosstown = team.key === 'cubs' ? '4' : team.key === 'whitesox' ? '16' : ''
  const [opponent, setOpponent] = useState(crosstown)
  const opponents = [...new Map(games.map((g) => [String(g.opponent.id ?? g.opponent.name), g.opponent.name])).entries()].sort((a, b) => a[1].localeCompare(b[1]))
  const selected = opponent || opponents[0]?.[0] || ''
  const matches = games.filter((g) => String(g.opponent.id ?? g.opponent.name) === selected)
  const summary = seasonSummary(matches)
  const biggest = scoredGames(matches).filter((g) => g.result === 'W').sort((a, b) => (Number(b.ourScore) - Number(b.theirScore)) - (Number(a.ourScore) - Number(a.theirScore)))[0]
  const next = matches.find((g) => !g.completed && !isCancelled(g))
  const partial = isPartialSchedule(team, season)
  return <Panel title={`${seasonLabel(team, season)} rivalry mode`} note="Regular-season matchups. Choose an opponent to explore the series.">
    <Async state={state} what="rivalry games" isEmpty={() => games.length === 0} empty="No schedule available for this season.">{() => <>
      <div className="filter-bar"><label>Rival<select value={selected} onChange={(e) => setOpponent(e.target.value)}>{crosstown && !opponents.some(([id]) => id === crosstown) ? <option value={crosstown}>{team.key === 'cubs' ? 'White Sox' : 'Cubs'}</option> : null}{opponents.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>{crosstown ? <button className="pixel-button" aria-pressed={selected === crosstown} onClick={() => setOpponent(crosstown)}>Crosstown: Cubs × Sox</button> : null}</div>
      <div className="feature-intro compact"><span className="eyebrow">{selected === crosstown ? 'The Crosstown series' : 'Head to head'}</span><h2>{team.short} × {opponents.find(([id]) => id === selected)?.[1] ?? (team.key === 'cubs' ? 'White Sox' : 'Cubs')}</h2><p>{matches.length} scheduled matchups this season.</p></div>
      {partial ? <div className="note">Partial archive: season-series records and totals are unavailable.</div> : <SpoilerGate scope={`rivalry:${team.key}:${season}:${selected}`} label="series results"><div className="summary"><div><span>Series record</span><strong>{summary.played ? summary.record : '—'}</strong></div><div><span>Scoring differential</span><strong>{summary.played ? `${summary.differential > 0 ? '+' : ''}${summary.differential}` : '—'}</strong></div><div><span>Biggest win</span><strong>{biggest ? `${biggest.ourScore}–${biggest.theirScore}` : '—'}</strong></div></div>{team.league === 'nhl' ? <p className="micro-note">Losses include overtime and shootouts.</p> : null}</SpoilerGate>}
      {next ? <><div className="group-title">{next.state === 'in' ? 'Playing now' : 'Next matchup'}</div><GameCard game={next} team={team} /></> : <p className="micro-note">No upcoming matchups published in this regular season.</p>}
      <div className="group-title">All matchups</div>{matches.length ? matches.map((g) => <GameCard key={gameKey(team, g)} team={team} game={g} />) : <div className="state">No matchups published against this opponent.</div>}
    </>}</Async>
  </Panel>
}
