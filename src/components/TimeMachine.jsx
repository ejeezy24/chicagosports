import { useState } from 'react'
import { TEAMS } from '../teams.js'
import { ARCHIVE } from '../archiveData.js'
import { getSchedule } from '../api.js'
import { scheduleEvents, recordFromGames } from '../espn.js'
import { seasonLabel } from '../seasons.js'
import { useAsync } from '../useAsync.js'
import { SpoilerGate } from '../FanContext.jsx'
import { Panel } from './ui.jsx'
import { VideoLinks } from './VideoLinks.jsx'
import '../city-experiences.css'

export function TimeMachine({ onExplore }) {
  const max = new Date().getFullYear()
  const [year, setYear] = useState(2016)
  const [draft, setDraft] = useState(2016)
  const choose = value => { const next = Math.min(max, Math.max(1900, Number(value) || 2016)); setYear(next); setDraft(next) }
  return <Panel title="Chicago Time Machine" aside="One year. Five clubs." note="NBA and NHL seasons use the year they end. Championship badges use the official season year; dated moments use their calendar date.">
    <div className="time-machine">
      <div className="time-hero"><span>CHICAGO, THROUGH THE YEARS</span><strong>{year}</strong><p>Find out what the city was cheering for.</p></div>
      <form className="time-controls" onSubmit={event => { event.preventDefault(); choose(draft) }}>
        <label className="time-slider">Travel through time<input type="range" min="1900" max={max} value={draft} onChange={event => setDraft(event.target.value)} /></label>
        <label>Year<input type="number" min="1900" max={max} value={draft} onChange={event => setDraft(event.target.value)} required /></label><button className="pixel-button primary">Explore year</button>
      </form>
      <div className="time-shortcuts">{[1985, 1996, 2005, 2010, 2016, max].map(value => <button className="pixel-button" key={value} aria-pressed={value === year} onClick={() => choose(value)}>{value}</button>)}</div>
      <SpoilerGate scope={`time-machine:${year}`} label="this year's history"><div className="time-clubs">{TEAMS.map(team => <SeasonSnapshot key={team.key + year} team={team} year={year} onExplore={onExplore} />)}</div></SpoilerGate>
    </div>
  </Panel>
}
function SeasonSnapshot({ team, year, onExplore }) {
  const available = year >= team.oldestSeason
  const state = useAsync(() => available ? getSchedule(team, year, 2) : Promise.resolve(null), [team.key, year])
  const games = scheduleEvents(state.data, team.espnId)
  const record = recordFromGames(games)
  const archive = ARCHIVE[team.key]
  const moments = archive.moments.filter(moment => Number(moment.date.slice(0, 4)) === year)
  return <article className="time-club" style={{ '--club-color': team.color }}>
    <header><span>{team.leagueLabel} · {seasonLabel(team, year)}</span><h3>{team.short}</h3></header>
    {archive.championships.includes(year) ? <strong className="time-champion">Championship season</strong> : null}
    <p>{state.loading ? 'Loading season record…' : record.played ? `${record.w}–${record.l}${record.t ? `–${record.t}` : ''} · ${record.played} completed games in available regular-season feed` : 'Season record unavailable in this archive.'}</p>
    {state.error ? <button className="text-button" onClick={state.retry}>Retry season record</button> : null}
    {moments.map(moment => <div className="time-moment" key={moment.date}><time>{moment.date}</time><h4>{moment.title}</h4><p>{moment.detail}</p><VideoLinks team={team} moment={moment} /></div>)}
    {!moments.length ? <p className="muted">No curated milestone for this calendar year.</p> : null}
    <div className="time-club-links">{available ? <button className="text-button" onClick={() => onExplore(team.key, year)}>Explore season →</button> : null}<a href={archive.source.url} target="_blank" rel="noreferrer">{archive.source.label} ↗</a></div>
  </article>
}
