import { useId, useMemo, useState } from 'react'
import { getSummary } from '../api.js'
import { useAsync } from '../useAsync.js'
import { useLivePoll } from '../useLivePoll.js'
import { Async } from './ui.jsx'
import { BoxscoreContent } from './Boxscore.jsx'
import { liveStateIsOngoing, normalizeLiveGame } from '../liveGame.js'
import '../live-game.css'

export function LiveGameCenter({ team, eventId, live = false }) {
  const state = useAsync(({ fresh }) => getSummary(team, eventId, { fresh }), [team.key, eventId])
  const model = useMemo(() => state.data ? normalizeLiveGame(state.data, team) : null, [state.data, team])
  useLivePoll(state.refresh, model ? liveStateIsOngoing(model) : live)
  return <div className="live-game-center" data-event-id={eventId}>
    <h3 className="game-center-title">Game center</h3>
    <Async state={state} what="the game center" rows={2} isEmpty={() => !model?.teams.length && !model?.hasPlayData} empty="No game summary published for this game.">
      {(data) => <>
        {state.refreshError ? <p className="live-unavailable" role="status">Couldn’t refresh right now. Showing the last successful update.</p> : null}
        <CenterContent data={data} model={model} team={team} onRefresh={state.refresh} />
      </>}
    </Async>
  </div>
}
function CenterContent({ data, model, team, onRefresh }) {
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
