export function BallparkMode({ model, team, onRefresh }) {
  const situation = model?.situation
  const baseball = team.sport === 'baseball'
  return <div className="ballpark-mode">
    <div className="ballpark-status"><b>{model.state === 'in' ? 'LIVE' : model.status}</b><span>{[model.period, model.clock].filter(Boolean).join(' · ')}</span><button onClick={onRefresh}>Refresh game</button></div>
    <div className="experience-score">{model.teams.map(side => <div key={side.id}><span>{side.name}</span><strong key={side.score}>{side.score}</strong></div>)}</div>
    {baseball ? <div className="ballpark-field">
      <div className="diamond" role="img" aria-label={['first', 'second', 'third'].map(base => `${base} base: ${situation?.[base] === true ? 'occupied' : situation?.[base] === false ? 'empty' : 'unavailable'}`).join(', ')}>
        <div className="diamond-infield" />
        {['first', 'second', 'third'].map((base, i) => <span className={`diamond-base base-${base} ${situation?.[base] === true ? 'occupied' : situation?.[base] === false ? 'empty' : 'unknown'}`} key={base}>{i + 1}</span>)}
        <span className="diamond-home">H</span>
      </div>
      <div className="baseball-situation"><div><span>Balls–strikes</span><strong>{situation?.balls ?? '—'}–{situation?.strikes ?? '—'}</strong></div><div><span>Outs</span><strong>{situation?.outs ?? '—'}</strong></div><div><span>Pitch count</span><strong>{situation?.pitchCount ?? '—'}</strong></div>
        {situation?.pitcher ? <p>Pitching: {situation.pitcher}</p> : null}{situation?.batter ? <p>Batting: {situation.batter}</p> : null}
        <small>Gold = occupied · outlined = empty · ? = not reported. Dashes mean the feed has no current value.</small>
      </div>
    </div> : null}
    <h3>Latest plays</h3>{model.plays.length ? <ol className="ballpark-plays">{model.plays.slice(-8).reverse().map(play => <li key={play.id}><small>{[play.period, play.clock].filter(Boolean).join(' · ')}</small>{play.text}</li>)}</ol> : <p>Play-by-play is not available for this game.</p>}
  </div>
}
