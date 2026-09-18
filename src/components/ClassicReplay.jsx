import { useEffect, useState } from 'react'

export function ClassicReplay({ model }) {
  const [cursor, setCursor] = useState(-1)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(2200)
  const plays = model.plays
  const ended = plays.length > 0 && cursor === plays.length - 1
  useEffect(() => {
    if (!playing || ended) return undefined
    const timer = setTimeout(() => setCursor(value => Math.min(plays.length - 1, value + 1)), speed)
    return () => clearTimeout(timer)
  }, [playing, ended, cursor, plays.length, speed])
  const frame = plays[cursor]
  const move = next => { setPlaying(false); setCursor(next) }
  const scoreFor = side => ended ? side.score : frame?.[side.homeAway === 'home' ? 'homeScore' : 'awayScore'] ?? '—'
  return <div className="classic-replay">
    <p className="replay-label">{ended ? 'Replay complete · Final' : 'The ending stays hidden until the last play'}</p>
    <div className="experience-score">{model.teams.map(side => <div key={side.id}><span>{side.name}</span><strong>{scoreFor(side)}</strong></div>)}</div>
    {!plays.length ? <p className="experience-missing">This game does not have a play-by-play feed to replay. Try a more recent completed game.</p> : <>
      <p className="replay-position">{cursor < 0 ? 'Ready to begin' : `Play ${cursor + 1} of ${plays.length}`}{frame?.period ? ` · ${frame.period}` : ''}{frame?.clock ? ` · ${frame.clock}` : ''}</p>
      <progress max={plays.length} value={cursor + 1} aria-label="Replay progress" />
      <p className="replay-play" aria-live={playing && !ended ? 'off' : 'polite'}>{frame?.text ?? 'Press Next play or Play to step into the game.'}</p>
      <div className="replay-controls"><button onClick={() => move(-1)}>Restart</button><button disabled={cursor < 0} onClick={() => move(cursor - 1)}>Previous play</button><button disabled={ended} onClick={() => setPlaying(value => !value)}>{playing && !ended ? 'Pause' : 'Play'}</button><button disabled={ended} onClick={() => move(cursor + 1)}>Next play</button><button disabled={ended} onClick={() => move(plays.length - 1)}>Jump to ending</button>
        <label>Speed <select value={speed} onChange={event => setSpeed(Number(event.target.value))}><option value={4000}>Slow</option><option value={2200}>Normal</option><option value={1000}>Fast</option></select></label>
      </div><p className="experience-missing">Scores appear only when supplied with that play. This is a replay of the available feed; older games may have incomplete coverage.</p>
    </>}
  </div>
}
