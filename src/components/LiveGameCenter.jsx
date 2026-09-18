import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { getSummary } from '../api.js'
import { useAsync } from '../useAsync.js'
import { useLivePoll } from '../useLivePoll.js'
import { Async } from './ui.jsx'
import { BoxscoreContent } from './Boxscore.jsx'
import { liveStateIsOngoing, normalizeLiveGame } from '../liveGame.js'
import '../live-game.css'
import '../game-experiences.css'
import { BallparkMode } from './BallparkMode.jsx'
import { ClassicReplay } from './ClassicReplay.jsx'
import { VictoryCelebration } from './VictoryCelebration.jsx'
import { hasReplayData } from '../gameExperiences.js'
import { useFan } from '../FanContext.jsx'
import { ExperienceDialog } from './ExperienceDialog.jsx'

const celebratedGames = new Set()

export function LiveGameCenter({ team, eventId, live = false, initialMode = null, onClose }) {
  const fan = useFan()
  const [mode, setMode] = useState(initialMode)
  const [celebrate, setCelebrate] = useState(false)
  const [celebrations, setCelebrations] = useState(() => { try { return localStorage.getItem('cs.celebrations') !== 'off' } catch { return true } })
  const previous = useRef(null)
  const state = useAsync(({ fresh }) => getSummary(team, eventId, { fresh }), [team.key, eventId])
  const model = useMemo(() => state.data ? normalizeLiveGame(state.data, team) : null, [state.data, team])
  useLivePoll(state.refresh, model ? liveStateIsOngoing(model) : live)
  useEffect(() => {
    const key = `${team.key}:${eventId}`
    if (previous.current?.key === key && previous.current?.model?.state === 'in' && model?.completed && model.teams.some(side => side.isUs && side.winner) && !celebratedGames.has(key)) {
      celebratedGames.add(key)
      if (celebrations && !fan.spoiler && mode !== 'replay') setCelebrate(true)
    }
    if (model) previous.current = { key, model }
  }, [model, fan.spoiler, celebrations, team.key, eventId, mode])
  const dismiss = useCallback(() => setCelebrate(false), [])
  const closeMode = () => { setMode(null); if (initialMode) onClose?.() }
  const changeCelebrations = event => {
    setCelebrations(event.target.checked)
    if (!event.target.checked) setCelebrate(false)
    try { localStorage.setItem('cs.celebrations', event.target.checked ? 'on' : 'off') } catch { /* Session preference still works. */ }
  }
  const experience = mode ? <ExperienceDialog title={mode === 'replay' ? 'Relive this game' : team.sport === 'baseball' ? 'Live Ballpark' : 'Arena mode'} team={team} onClose={closeMode} fullscreen={mode === 'ballpark'}>
    <Async state={state} what="the game experience" rows={2} isEmpty={() => !model?.teams.length} empty="No game feed is available yet.">
      {() => mode === 'replay' ? <ClassicReplay model={model} /> : <BallparkMode model={model} team={team} onRefresh={state.refresh} />}
    </Async>
    {state.refreshError ? <p role="status">Could not refresh. Showing the last successful update.</p> : null}
    {celebrate && !fan.spoiler && mode !== 'replay' ? <VictoryCelebration team={team} onClose={dismiss} /> : null}
  </ExperienceDialog> : null
  if (initialMode && mode) return experience
  return <div className="live-game-center" data-event-id={eventId}>
    <h3 className="game-center-title">Game center</h3>
    <label className="celebration-setting"><input type="checkbox" checked={celebrations} onChange={changeCelebrations} />Victory celebrations</label>
    <Async state={state} what="the game center" rows={2} isEmpty={() => !model?.teams.length && !model?.hasPlayData} empty="No game summary published for this game.">
      {(data) => <>
        {state.refreshError ? <p className="live-unavailable" role="status">Couldn’t refresh right now. Showing the last successful update.</p> : null}
        <CenterContent data={data} model={model} team={team} onRefresh={state.refresh} onLaunch={setMode} />
      </>}
    </Async>
    {celebrate && !fan.spoiler && !mode ? <VictoryCelebration team={team} onClose={dismiss} /> : null}
    {experience}
  </div>
}
function CenterContent({ data, model, team, onRefresh, onLaunch }) {
  const ongoing = liveStateIsOngoing(model)
  const titleId = useId()
  return <>
    <section className={`live-scoreboard${ongoing ? ' is-live' : ''}`} aria-label="Game status">
      <div className="live-status-row">
        {ongoing ? <b className="live-status">LIVE</b> : null}
        <span>{model?.status ?? 'Game status unavailable'}</span>
        {model?.period ? <span className="live-period">{model.period}</span> : null}
        {model?.clock ? <span className="live-clock">{model.clock}</span> : null}
        <button className="text-button live-refresh" type="button" onClick={onRefresh}>Refresh</button>
        <button className="text-button" type="button" onClick={() => onLaunch('ballpark')}>{team.sport === 'baseball' ? 'Ballpark mode' : 'Arena mode'}</button>
        {model.completed && hasReplayData(model) ? <button className="text-button" type="button" onClick={() => onLaunch('replay')}>Replay</button> : null}
      </div>
      <div className="live-score-teams">{(model?.teams ?? []).map((side) => <div className={`live-team${side.isUs ? ' is-us' : ''}`} key={side.id ?? side.abbr}>
        <span className="live-logo">{side.logo ? <img src={side.logo} alt="" loading="lazy" /> : null}</span>
        <span>{side.name}</span><strong>{side.score}</strong>
      </div>)}</div>
    </section>
    {model?.performers?.length ? <section className="live-section" aria-labelledby={titleId}>
      <h3 id={titleId}>Key performers</h3>
      <div className="live-performers">{model.performers.map((person, index) => <div key={`${person.name}-${index}`}><b>{person.name}</b><span>{person.label}{person.detail ? ` · ${person.detail}` : ''}</span></div>)}</div>
    </section> : null}
    {model?.scoringPlays?.length ? <PlaySection title="Scoring plays" plays={model.scoringPlays} /> : null}
    {model?.plays?.length ? <PlaySection title="Play-by-play" plays={model.plays} /> : <p className="live-unavailable">Play-by-play is not available for this game.</p>}
    <section className="live-boxscore" aria-label="Full boxscore">
      <h3>Full boxscore</h3><div className="boxscore"><BoxscoreContent team={team} data={data} /></div>
    </section>
  </>
}
function PlaySection({ title, plays }) {
  const [limit, setLimit] = useState(40)
  const earlier = Math.max(0, plays.length - limit)
  return <details className="live-section live-plays" open={title === 'Scoring plays' ? true : undefined}>
    <summary>{title}<span>{plays.length}</span></summary>
    {earlier > 0 ? <button className="text-button" onClick={() => setLimit((value) => value + 40)}>Show earlier plays ({earlier} more)</button> : null}
    <ol start={earlier + 1}>{plays.slice(-limit).map((play) => <li key={play.id}><span>{[play.period, play.clock].filter(Boolean).join(' · ')}{play.period || play.clock ? ' · ' : ''}</span>{play.text}</li>)}</ol>
  </details>
}
