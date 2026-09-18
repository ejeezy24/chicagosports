import { useEffect, useMemo, useRef, useState } from 'react'
import { SpoilerGate } from '../FanContext.jsx'
import { scheduleFloor } from '../coverage.js'
import { seasonLabel, seasonOptions } from '../seasons.js'
import { GameCard } from './GameCard.jsx'
import { Panel } from './ui.jsx'
import { classifyGame, isFinderGame, loadFinderSchedules, sortFinderGames, verifyWalkoffCandidates } from '../greatGames.js'
import '../great-games.css'

const MAX_SEASONS = 5
const MAX_VERIFY_BATCH = 12

export function GreatGames({ team, season, seasons }) {
  const options = useMemo(() => (seasons?.length ? seasons : seasonOptions(team, { includeOlder: true })).filter((value) => Number(value) >= scheduleFloor(team)), [team, seasons])
  const initial = options.includes(Number(season)) ? Number(season) : Number(options[0])
  const [from, setFrom] = useState(initial)
  const [to, setTo] = useState(initial)
  const [category, setCategory] = useState('all')
  const [result, setResult] = useState('all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('newest')
  const [state, setState] = useState({ loading: false, games: [], failures: [], requested: [] })
  const [walkoffCheck, setWalkoffCheck] = useState({ checked: new Set(), verified: new Set(), unknown: 0, failures: 0, loading: false })
  const generation = useRef(0)

  useEffect(() => {
    const low = Math.min(Number(from), Number(to))
    const high = Math.max(Number(from), Number(to))
    const fullSelection = options.filter((value) => value >= low && value <= high)
    const selected = fullSelection.slice(0, MAX_SEASONS)
    const requestGeneration = ++generation.current
    if (!selected.length) { setState({ loading: false, games: [], failures: [], requested: [] }); return undefined }
    let alive = true
    setWalkoffCheck({ checked: new Set(), verified: new Set(), unknown: 0, failures: 0, loading: false })
    setState({ loading: true, games: [], failures: [], requested: selected })
    loadFinderSchedules(team, selected).then((data) => { if (alive && requestGeneration === generation.current) setState({ loading: false, ...data, fullRequested: fullSelection.length }) })
      .catch((error) => { if (alive && requestGeneration === generation.current) setState({ loading: false, games: [], failures: [{ error }], requested: selected, fullRequested: fullSelection.length }) })
    return () => { alive = false }
  }, [team, options, from, to])

  const filtered = useMemo(() => sortFinderGames(state.games.filter((game) => isFinderGame(game, team, category, query) && (result === 'all' || game.result === result)), sort), [state.games, team, category, query, result, sort])
  const scope = `great-games:${team.key}:${state.requested.join(',')}:${category}:${result}:${query}:${sort}`
  const walkoffCandidates = state.games.filter((game) => game.home && game.result === 'W' && !walkoffCheck.checked.has(game.id))
  const checkWalkoffs = async () => {
    if (state.loading || walkoffCheck.loading || !walkoffCandidates.length) return
    const batch = walkoffCandidates.slice(0, MAX_VERIFY_BATCH)
    setWalkoffCheck((current) => ({ ...current, loading: true }))
    const checkedIds = new Set(batch.map((game) => game.id))
    const requestGeneration = generation.current
    const data = await verifyWalkoffCandidates(team, batch, { batchSize: MAX_VERIFY_BATCH })
    if (requestGeneration !== generation.current) return
    setState((current) => ({ ...current, games: current.games.map((game) => data.verified.includes(game.id) ? { ...game, _finderMeta: { ...game._finderMeta, walkoffVerified: true } } : game) }))
    setWalkoffCheck((current) => ({ checked: new Set([...current.checked, ...checkedIds]), verified: new Set([...current.verified, ...data.verified]), unknown: current.unknown + data.unknown.length, failures: current.failures + data.failures.length, loading: false }))
  }
  const seasonChoices = options.slice(0, 1_000)
  const emptyReason = category === 'walkoff' && (walkoffCandidates.length || walkoffCheck.unknown) ? 'No verified walk-offs yet. Check more games; summaries without enough evidence stay unknown.' : !options.length ? 'No complete seasons are available for this finder.' : state.requested.length === 0 ? 'Choose a supported season range.' : 'No memorable completed games match these filters.'

  return <Panel title="Great games finder" aside={state.loading ? 'Loading…' : 'Search up to 5 seasons'} note="Close finishes, big margins, shutouts, and explicitly reported extra periods from completed games.">
    <div className="great-games-controls">
      <label>From<select value={from} onChange={(event) => setFrom(Number(event.target.value))}>{seasonChoices.map((value) => <option key={value} value={value}>{seasonLabel(team, value)}</option>)}</select></label>
      <label>To<select value={to} onChange={(event) => setTo(Number(event.target.value))}>{seasonChoices.map((value) => <option key={value} value={value}>{seasonLabel(team, value)}</option>)}</select></label>
      <label>Moment<select value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">Any memorable game</option><option value="close">Close finish ({team.sport === 'baseball' ? '≤1 run' : team.sport === 'hockey' ? '≤1 goal' : team.sport === 'basketball' ? '≤5 points' : '≤8 points'})</option><option value="blowout">Blowout ({team.sport === 'baseball' ? '≥8 runs' : team.sport === 'hockey' ? '≥4 goals' : team.sport === 'basketball' ? '≥20 points' : '≥21 points'})</option>{team.sport !== 'basketball' ? <option value="shutout">Shutout</option> : null}<option value="extra">{team.sport === 'baseball' ? 'Extra innings' : team.sport === 'hockey' ? 'Overtime / shootout' : 'Overtime'}</option>{team.sport === 'baseball' ? <option value="walkoff">Walk-off</option> : null}</select></label>
      <label>Result<select value={result} onChange={(event) => setResult(event.target.value)}><option value="all">Win or loss</option><option value="W">Wins</option><option value="L">Losses</option></select></label>
      <label className="great-games-search">Matchup<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Opponent" /></label>
      <label>Sort<select value={sort} onChange={(event) => setSort(event.target.value)}><option value="newest">Newest first</option><option value="tight">Tightest margin</option></select></label>
    </div>
    {state.fullRequested > MAX_SEASONS ? <p className="micro-note">Searching the newest {MAX_SEASONS} of {state.fullRequested} selected seasons: {state.requested.join(', ')}. Narrow the range to search earlier years.</p> : null}
    {state.failures.length ? <p className="micro-note" role="status">Some seasons could not be loaded ({state.failures.map((failure) => failure.season ?? 'unknown').join(', ')}). Available results are still shown.</p> : null}
    <SpoilerGate scope={scope} label="great-game results">
      <div className="great-games-verification">
        <strong>{filtered.length} memorable game{filtered.length === 1 ? '' : 's'} found</strong>
        {team.sport === 'baseball' ? <><button className="pixel-button" type="button" onClick={checkWalkoffs} disabled={state.loading || walkoffCheck.loading || !walkoffCandidates.length}>{walkoffCheck.loading ? 'Checking games…' : walkoffCheck.checked.size ? 'Check more games' : 'Check games for walk-offs'}</button>
        <span>{walkoffCheck.checked.size} of {walkoffCheck.checked.size + walkoffCandidates.length} home wins checked</span>
        {walkoffCheck.unknown ? <small>{walkoffCheck.unknown} games have unknown walk-off evidence.</small> : null}
        {walkoffCheck.failures ? <small>{walkoffCheck.failures} summary requests failed.</small> : null}</> : null}
      </div>
      {state.loading ? <div className="state" role="status">Loading selected seasons…</div> : filtered.length ? <div className="great-games-list">{filtered.map((game) => <div className="great-game-result" key={`${team.key}:${game.id}`}><div className="great-game-tags" aria-label="Why this game is listed">{classifyGame(game, team).map((label) => <span key={label}>{label === 'extra' ? (team.sport === 'baseball' ? 'extra innings' : team.sport === 'hockey' ? 'OT / shootout' : 'overtime') : label}</span>)}</div><GameCard game={game} team={team} /></div>)}</div> : <div className="state">{emptyReason}</div>}
    </SpoilerGate>
  </Panel>
}
