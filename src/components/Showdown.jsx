import { useId, useState } from 'react'
import { getSchedule, getPlayerStats, usesArchiveData } from '../api.js'
import { scheduleEvents } from '../espn.js'
import { espnPlayerStats, mlbPlayerStats, archivedPlayerStats } from '../players.js'
import { useAsync } from '../useAsync.js'
import { seasonOptions, seasonLabel } from '../seasons.js'
import { scheduleFloor } from '../coverage.js'
import { scoredGames, seasonSummary } from '../fan.js'
import { SpoilerGate } from '../FanContext.jsx'
import { Panel, Async } from './ui.jsx'

export function Showdown({ team, season }) {
  const options = seasonOptions(team, { includeOlder: true }).filter((s) => s >= scheduleFloor(team))
  const [left, setLeft] = useState(options.includes(season) ? season : options[0])
  const [right, setRight] = useState(options.find((s) => s < (options.includes(season) ? season : options[0])) ?? options[1])
  return <Panel title="Season showdown" note="Compare regular seasons through the same number of completed games. Only seasons with reliable schedule coverage are offered.">
    <div className="filter-bar"><label>Season A<select value={left} onChange={(e) => setLeft(Number(e.target.value))}>{options.map((s) => <option key={s} value={s}>{seasonLabel(team, s)}</option>)}</select></label><span className="versus">VS</span><label>Season B<select value={right} onChange={(e) => setRight(Number(e.target.value))}>{options.map((s) => <option key={s} value={s}>{seasonLabel(team, s)}</option>)}</select></label></div>
    <SpoilerGate scope={`showdown:${team.key}:${left}:${right}`} label="comparison"><Comparison key={`${left}:${right}`} team={team} left={left} right={right} /></SpoilerGate>
  </Panel>
}

function Comparison({ team, left, right }) {
  const state = useAsync(async () => {
    const payloads = await Promise.all([getSchedule(team, left), getSchedule(team, right)])
    return payloads.map((data) => scoredGames(scheduleEvents(data, team.espnId)))
  }, [team.key, left, right])
  return <Async state={state} what="season comparison" isEmpty={(d) => !d[0].length || !d[1].length} empty="Both seasons need completed games with scores before they can be compared. Choose an earlier season.">{(data) => <ComparisonResults team={team} left={left} right={right} games={data} />}</Async>
}

function ComparisonResults({ team, left, right, games }) {
  const max = Math.min(games[0].length, games[1].length)
  const [count, setCount] = useState(max)
  const id = useId()
  const selected = games.map((list) => list.slice(0, count))
  const summaries = selected.map(seasonSummary)
  const rows = [
    ['Record', (s) => s.record], ['Scored', (s) => s.scored], ['Allowed', (s) => s.allowed],
    ['Scored / game', (s) => s.average], ['Differential', (s) => `${s.differential > 0 ? '+' : ''}${s.differential}`],
    ['Home record', (_, i) => seasonSummary(selected[i].filter((g) => g.home && !g.neutral)).record],
    ['Away record', (_, i) => seasonSummary(selected[i].filter((g) => !g.home && !g.neutral)).record],
  ]
  return <>
    <div className="comparison-slider"><label htmlFor={id}>Through game <strong>{count}</strong> <span className="muted">of {max} available in both seasons</span></label><input id={id} type="range" min="1" max={max} value={count} onChange={(e) => setCount(Number(e.target.value))} /></div>
    <div className="table-wrap"><table className="comparison-table"><thead><tr><th scope="col">{team.short}</th><th scope="col">A · {seasonLabel(team, left)}</th><th scope="col">B · {seasonLabel(team, right)}</th></tr></thead><tbody>{rows.map(([label, read]) => <tr key={label}><th scope="row">{label}</th>{summaries.map((s, i) => <td key={i}>{read(s, i)}</td>)}</tr>)}</tbody></table></div>
    <WinChart games={selected} labels={[seasonLabel(team, left), seasonLabel(team, right)]} />
    <p className="micro-note">Only completed games with both scores count. {team.league === 'nhl' ? 'Losses include overtime and shootouts. ' : ''}Neutral-site games are excluded from home/away splits.</p>
    <div className="leader-grid">{[left, right].map((year, i) => <SeasonLeaders key={`${i}:${year}`} team={team} season={year} />)}</div>
  </>
}

function WinChart({ games, labels }) {
  const id = useId()
  const count = games[0].length
  const paths = games.map((list) => { let wins = 0; return [[40, 180], ...list.map((g, i) => { if (g.result === 'W') wins++; return [40 + (i + 1) / count * 640, 180 - wins / count * 150] })].map((p) => p.join(',')).join(' ') })
  return <figure className="win-chart"><figcaption>Cumulative wins · A: {labels[0]} (solid) · B: {labels[1]} (dashed)</figcaption><svg viewBox="0 0 720 210" role="img" aria-labelledby={id}><title id={id}>Wins through {count} games: {labels[0]} has {seasonSummary(games[0]).wins}; {labels[1]} has {seasonSummary(games[1]).wins}.</title><path d="M40 25V180H680" fill="none" stroke="currentColor" /><text x="8" y="35">{count}</text><text x="18" y="184">0</text><text x="570" y="204">Game {count}</text>{paths.map((points, i) => <polyline key={i} points={points} fill="none" stroke={i ? '#c22133' : '#0e3386'} strokeWidth="3" strokeDasharray={i ? '8 5' : undefined} />)}</svg></figure>
}

function SeasonLeaders({ team, season }) {
  const historical = usesArchiveData(team, season)
  const supported = team.sport !== 'football' || Number(season) >= 1999
  const state = useAsync(() => supported ? getPlayerStats(team, season) : Promise.resolve(null), [team.key, season, supported])
  const groups = team.sport === 'baseball' ? mlbPlayerStats(state.data, team.mlbId) : historical ? archivedPlayerStats(team, state.data) : espnPlayerStats(state.data)
  const leaders = groups.flatMap((group) => {
    const choices = /pitch/i.test(group.name) ? ['SO', 'W', 'SV'] : ['HR', 'RBI', 'PTS', 'P', 'YDS', 'TD', 'G']
    const label = choices.find((c) => group.columns.includes(c))
    const index = group.columns.indexOf(label)
    if (index < 0) return []
    const rows = group.rows.filter((p) => p.values[index] !== '' && p.values[index] !== '—' && Number.isFinite(Number(String(p.values[index]).replaceAll(',', ''))))
    const best = Math.max(...rows.map((p) => Number(String(p.values[index]).replaceAll(',', ''))))
    const winners = rows.filter((p) => Number(String(p.values[index]).replaceAll(',', '')) === best)
    return winners.length ? [{ category: group.name, label, value: best, name: winners.map((p) => p.name).join(', ') }] : []
  }).slice(0, 3)
  return <section className="leader-card"><h3>{seasonLabel(team, season)} leaders</h3><p className="micro-note">Full-season player figures; unaffected by the game slider.</p>{!supported ? <p>Historical team leaders unavailable for this league.</p> : <Async state={state} what="season leaders" isEmpty={() => !leaders.length} empty="No season leaders published.">{() => leaders.map((leader) => <div className="leader" key={leader.category}><span>{leader.category} · {leader.label}</span><strong>{leader.name}</strong><b>{leader.value}</b></div>)}</Async>}</section>
}
