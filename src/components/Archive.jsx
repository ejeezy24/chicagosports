import { useMemo, useState } from 'react'
import { getPlayerStats, getSchedule, isHistorical } from '../api.js'
import { ARCHIVE, RIVALRIES, allArchiveEntries, cityChampionships, closestAnniversary } from '../archiveData.js'
import { recordFromGames, scheduleEvents } from '../espn.js'
import {
  espnPlayerStats,
  mlbPlayerStats,
  nbaPlayerStats,
  nflPlayerStats,
  nhlPlayerStats,
} from '../players.js'
import { seasonLabel } from '../seasons.js'
import { teamByKey } from '../teams.js'
import { useAsync } from '../useAsync.js'
import { Async, Panel } from './ui.jsx'

const VIEWS = [
  ['story', 'Season story'],
  ['compare', 'Compare'],
  ['history', 'Timeline'],
  ['records', 'Leaders'],
  ['rivalries', 'Rivalries'],
  ['search', 'Search'],
  ['favorites', 'Favorites'],
]

const favoriteStore = {
  get() {
    try { return JSON.parse(localStorage.getItem('cs.favorites') ?? '[]') } catch { return [] }
  },
  set(value) {
    try { localStorage.setItem('cs.favorites', JSON.stringify(value)) } catch { /* device storage is optional */ }
  },
}

export function Archive({ team, season, seasons }) {
  const [view, setView] = useState('story')
  const [favorites, setFavorites] = useState(() => favoriteStore.get())
  const [compareSeason, setCompareSeason] = useState(() => seasons.find((value) => value < season) ?? seasons[1] ?? season)

  const state = useAsync(async () => {
    const [regular, postseason, players] = await Promise.allSettled([
      getSchedule(team, season, 2),
      getSchedule(team, season, 3),
      getPlayerStats(team, season),
    ])
    return {
      regular: regular.status === 'fulfilled' ? regular.value : null,
      postseason: postseason.status === 'fulfilled' ? postseason.value : null,
      players: players.status === 'fulfilled' ? players.value : null,
    }
  }, [team.key, season])

  const comparison = useAsync(
    () => view === 'compare' ? getSchedule(team, compareSeason, 2) : Promise.resolve(null),
    [team.key, compareSeason, view],
  )

  const toggleFavorite = (entry) => {
    const id = entry.id ?? `${entry.teamKey}:${entry.type}:${entry.title}`
    const next = favorites.some((item) => item.id === id)
      ? favorites.filter((item) => item.id !== id)
      : [...favorites, { ...entry, id }]
    setFavorites(next)
    favoriteStore.set(next)
  }

  return (
    <Panel
      title={`${team.short} archive desk`}
      aside={`${ARCHIVE[team.key].championships.length} championships`}
      note="Live season feeds power the story and comparisons. The timeline and franchise records are curated from official league and club history pages."
    >
      <div className="provenance-strip" aria-label="Archive data guide">
        <span><i className="source-dot verified" /> Curated and verified</span>
        <span><i className="source-dot live" /> League feed</span>
        <span><i className="source-dot local" /> Saved on this device</span>
      </div>
      <div className="archive-nav" aria-label="Archive sections">
        {VIEWS.map(([id, label]) => (
          <button key={id} aria-pressed={view === id} onClick={() => setView(id)}>{label}</button>
        ))}
      </div>

      {view === 'story' ? (
        <Async state={state} what="the season story" rows={6} isEmpty={(data) => !data.regular} empty="No season story is available for this year yet.">
          {(data) => <SeasonStory team={team} season={season} data={data} toggleFavorite={toggleFavorite} favorites={favorites} />}
        </Async>
      ) : null}
      {view === 'compare' ? (
        <CompareView
          team={team}
          season={season}
          seasons={seasons}
          compareSeason={compareSeason}
          setCompareSeason={setCompareSeason}
          current={state}
          comparison={comparison}
        />
      ) : null}
      {view === 'history' ? <HistoryView team={team} toggleFavorite={toggleFavorite} favorites={favorites} /> : null}
      {view === 'records' ? <RecordsView toggleFavorite={toggleFavorite} favorites={favorites} /> : null}
      {view === 'rivalries' ? <RivalriesView team={team} toggleFavorite={toggleFavorite} favorites={favorites} /> : null}
      {view === 'search' ? <SearchView team={team} season={season} data={state.data} toggleFavorite={toggleFavorite} favorites={favorites} /> : null}
      {view === 'favorites' ? <FavoritesView favorites={favorites} toggleFavorite={toggleFavorite} /> : null}
    </Panel>
  )
}

function SeasonStory({ team, season, data, toggleFavorite, favorites }) {
  const regular = scheduleEvents(data.regular, team.espnId)
  const postseason = scheduleEvents(data.postseason, team.espnId)
  const completed = regular.filter((game) => game.completed)
  const record = recordFromGames(completed)
  const playoffRecord = recordFromGames(postseason.filter((game) => game.completed))
  const streak = longestWinStreak(completed)
  const biggest = [...completed]
    .filter((game) => game.result === 'W')
    .sort((a, b) => margin(b) - margin(a))[0]
  const memorable = [...completed]
    .filter((game) => game.result === 'W')
    .sort((a, b) => margin(b) - margin(a))
    .slice(0, 3)
  const groups = normalizePlayerGroups(team, season, data.players)
  const featured = groups.flatMap((group) => group.rows.map((row) => ({ ...row, columns: group.columns }))).slice(0, 3)
  const anniversary = closestAnniversary(team.key)
  const archive = ARCHIVE[team.key]
  const card = {
    teamKey: team.key,
    type: 'Season',
    title: `${seasonLabel(team, season)} ${team.short}`,
    detail: `${record.text} regular season${playoffRecord.played ? ` · ${playoffRecord.text} postseason` : ''}`,
  }

  return (
    <div className="archive-body">
      <section className="story-hero">
        <div>
          <span className="archive-kicker">The season in one clipping</span>
          <h3>{seasonLabel(team, season)} {team.short}</h3>
          <p>{seasonSummary(team, season, record, playoffRecord, streak)}</p>
        </div>
        <div className="story-record"><strong>{record.played ? record.text : '—'}</strong><span>Regular season</span></div>
      </section>

      <div className="archive-stats">
        <Stat label="Games played" value={record.played || '—'} />
        <Stat label="Best win streak" value={streak ? `${streak} games` : '—'} />
        <Stat label="Postseason" value={playoffRecord.played ? playoffRecord.text : 'No games'} />
        <Stat label="Biggest win" value={biggest ? `+${margin(biggest)} vs ${biggest.opponent.abbr}` : '—'} />
      </div>

      {archive.championships.includes(Number(season)) ? (
        <div className="championship-banner">★ Championship season · Banner year {season}</div>
      ) : null}

      <div className="archive-columns">
        <section className="archive-sheet">
          <h4>Memorable games</h4>
          {memorable.length ? memorable.map((game) => (
            <div className="archive-line" key={game.id}>
              <time>{compactDate(game.date)}</time>
              <strong>{game.home ? 'vs' : '@'} {game.opponent.name}</strong>
              <span>{game.ourScore}–{game.theirScore}</span>
            </div>
          )) : <p className="archive-empty">Completed games will appear here.</p>}
        </section>
        <section className="archive-sheet">
          <h4>Season names</h4>
          {featured.length ? featured.map((player) => (
            <div className="archive-line" key={player.id}>
              <strong>{player.name}</strong>
              <span>{player.position ?? 'Player'}</span>
              <span>{firstStat(player)}</span>
            </div>
          )) : <p className="archive-empty">Open Player Stats for the complete season table.</p>}
        </section>
      </div>

      <section className="on-this-day">
        <span className="archive-kicker">{anniversary?.exact ? 'On this day' : 'Next archive anniversary'}</span>
        <h4>{anniversary?.title}</h4>
        <p>{anniversary?.detail}</p>
        <time>{anniversary ? longDate(anniversary.date) : ''}</time>
      </section>

      <div className="share-card" id="season-share-card">
        <span>Chicago Sports Archive</span>
        <strong>{card.title}</strong>
        <em>{card.detail}</em>
        <div className="share-actions">
          <FavoriteButton entry={card} favorites={favorites} toggle={toggleFavorite} />
          <button onClick={() => shareSeasonCard(card)}>Share card</button>
          <button onClick={() => downloadSeasonCard(team, card)}>Download image</button>
        </div>
      </div>
    </div>
  )
}

function CompareView({ team, season, seasons, compareSeason, setCompareSeason, current, comparison }) {
  const [mode, setMode] = useState('players')
  const currentGames = scheduleEvents(current.data?.regular, team.espnId).filter((game) => game.completed)
  const otherGames = scheduleEvents(comparison.data, team.espnId).filter((game) => game.completed)
  const a = seasonMetrics(currentGames)
  const b = seasonMetrics(otherGames)
  return (
    <div className="archive-body">
      <div className="compare-mode" aria-label="Comparison type">
        <button aria-pressed={mode === 'players'} onClick={() => setMode('players')}>Player vs. player</button>
        <button aria-pressed={mode === 'seasons'} onClick={() => setMode('seasons')}>Season vs. season</button>
      </div>
      {mode === 'players' ? (
        <Async state={current} what="player statistics" rows={5} isEmpty={(data) => !data?.players} empty="No player statistics are available for this season.">
          {(data) => <PlayerCompare team={team} season={season} payload={data.players} />}
        </Async>
      ) : (
        <>
          <div className="compare-controls">
            <strong>{seasonLabel(team, season)}</strong>
            <span>versus</span>
            <label>
              <span className="sr-only">Comparison season</span>
              <select value={compareSeason} onChange={(event) => setCompareSeason(Number(event.target.value))}>
                {seasons.filter((value) => value !== season).map((value) => <option key={value} value={value}>{seasonLabel(team, value)}</option>)}
              </select>
            </label>
          </div>
          <Async state={current} what="the selected season" rows={4} isEmpty={(data) => !data?.regular} empty="No regular-season games are available to compare.">
            {() => <Async state={comparison} what="the comparison season" rows={4} isEmpty={(data) => !data} empty="No games are available for the comparison season.">
            {() => (
              <div className="compare-board">
                <CompareRow label="Record" a={a.record.text} b={b.record.text} />
                <CompareRow label="Win percentage" a={pct(a.record)} b={pct(b.record)} />
                <CompareRow label="Points / runs scored" a={a.scored} b={b.scored} />
                <CompareRow label="Points / runs allowed" a={a.allowed} b={b.allowed} lower />
                <CompareRow label="Longest win streak" a={a.streak} b={b.streak} />
                <CompareRow label="Best win margin" a={a.biggest} b={b.biggest} />
              </div>
            )}
            </Async>}
          </Async>
        </>
      )}
    </div>
  )
}

function PlayerCompare({ team, season, payload }) {
  const choices = normalizePlayerGroups(team, season, payload).flatMap((group) =>
    group.rows.map((row) => ({
      ...row,
      key: `${group.name}:${row.id ?? row.name}`,
      group: group.name,
      columns: group.columns,
    })),
  )
  const [leftKey, setLeftKey] = useState(() => choices[0]?.key ?? '')
  const [rightKey, setRightKey] = useState(() => choices[1]?.key ?? choices[0]?.key ?? '')
  const left = choices.find((row) => row.key === leftKey) ?? choices[0]
  const right = choices.find((row) => row.key === rightKey) ?? choices[1] ?? choices[0]
  if (!left || !right) return <div className="archive-empty">Not enough player lines are available to compare.</div>

  const columns = [...new Set([...left.columns, ...right.columns])]
  const valueFor = (player, column) => {
    const index = player.columns.indexOf(column)
    return index >= 0 ? player.values[index] : '—'
  }

  return (
    <>
      <div className="player-compare-pickers">
        <label><span>Player one</span><select value={left.key} onChange={(event) => setLeftKey(event.target.value)}>{choices.map((row) => <option key={row.key} value={row.key}>{row.name} · {row.group}</option>)}</select></label>
        <b>VS</b>
        <label><span>Player two</span><select value={right.key} onChange={(event) => setRightKey(event.target.value)}>{choices.map((row) => <option key={row.key} value={row.key}>{row.name} · {row.group}</option>)}</select></label>
      </div>
      <div className="comparison-names"><strong>{left.name}</strong><span>{seasonLabel(team, season)}</span><strong>{right.name}</strong></div>
      <div className="compare-board">
        {columns.map((column) => <CompareRow key={column} label={column} a={valueFor(left, column)} b={valueFor(right, column)} />)}
      </div>
    </>
  )
}

function HistoryView({ team, toggleFavorite, favorites }) {
  const [scope, setScope] = useState('team')
  const data = ARCHIVE[team.key]
  const cityTitles = cityChampionships()
  return (
    <div className="archive-body">
      <section className="title-case">
        <div className="title-case-head">
          <div><span className="archive-kicker">Championship hub</span><h3>{scope === 'team' ? `${data.championships.length} ${team.short} titles` : `${cityTitles.length} Chicago titles`}</h3></div>
          <div className="compare-mode"><button aria-pressed={scope === 'team'} onClick={() => setScope('team')}>{team.short}</button><button aria-pressed={scope === 'city'} onClick={() => setScope('city')}>All Chicago</button></div>
        </div>
        <div className="ring-row">
          {scope === 'team'
            ? data.championships.map((year) => <span key={year}>★ {year}</span>)
            : cityTitles.map(({ year, teamKey }) => <span key={`${teamKey}-${year}`} style={{ borderColor: teamByKey(teamKey).color }}>{year} · {teamByKey(teamKey).short}</span>)}
        </div>
      </section>
      {scope === 'team' ? <div className="history-timeline">
        {data.moments.map((moment) => {
          const entry = { ...moment, teamKey: team.key, type: 'Moment' }
          return (
            <article key={moment.date}>
              <time>{longDate(moment.date)}</time>
              <div><h4>{moment.title}</h4><p>{moment.detail}</p></div>
              <FavoriteButton entry={entry} favorites={favorites} toggle={toggleFavorite} />
            </article>
          )
        })}
      </div> : <div className="city-title-list">{cityTitles.map(({ year, teamKey }) => {
        const club = teamByKey(teamKey)
        return <article key={`${teamKey}-${year}`}><strong>{year}</strong><span style={{ color: club.color }}>{club.name}</span><em>Champions</em></article>
      })}</div>}
      <SourceLink data={data} />
    </div>
  )
}

function RecordsView({ toggleFavorite, favorites }) {
  return (
    <div className="archive-body record-grid">
      {Object.entries(ARCHIVE).flatMap(([key, data]) => {
        const team = teamByKey(key)
        return (data.leaders ?? [data.record]).map((leader) => {
          const entry = { teamKey: key, type: 'Leader', title: leader.holder, detail: `${leader.value} ${leader.label.toLowerCase()}` }
          return <article className="record-card" key={`${key}-${leader.label}`} style={{ '--record-color': team.color }}>
            <span>{team.name}</span>
            <strong>{leader.value}</strong>
            <h4>{leader.holder}</h4>
            <p>{leader.label}</p>
            <div><FavoriteButton entry={entry} favorites={favorites} toggle={toggleFavorite} /> <SourceLink data={data} compact /></div>
          </article>
        })
      })}
    </div>
  )
}

function RivalriesView({ team, toggleFavorite, favorites }) {
  const relevant = RIVALRIES.filter((rivalry) => rivalry.teamKeys.includes(team.key))
  const rest = RIVALRIES.filter((rivalry) => !rivalry.teamKeys.includes(team.key))
  return (
    <div className="archive-body">
      <section className="rivalry-intro"><span className="archive-kicker">Chicago rivalry dossiers</span><h3>{team.short} feuds first. Citywide history after.</h3><p>Curated chapters, defining postseason meetings, and the games that made the opponent matter.</p></section>
      <div className="rivalry-grid">
        {[...relevant, ...rest].map((rivalry) => {
          const entry = { teamKey: rivalry.teamKeys[0], type: 'Rivalry', title: rivalry.nickname, detail: rivalry.detail }
          return <article key={rivalry.id} className={relevant.includes(rivalry) ? 'is-featured' : ''}>
            <span>{rivalry.era}</span><h4>{rivalry.nickname}</h4><strong>{rivalry.opponent}</strong><p>{rivalry.detail}</p>
            <ul>{rivalry.moments.map((moment) => <li key={moment}>{moment}</li>)}</ul>
            <FavoriteButton entry={entry} favorites={favorites} toggle={toggleFavorite} />
          </article>
        })}
      </div>
    </div>
  )
}

function SearchView({ team, season, data, toggleFavorite, favorites }) {
  const [query, setQuery] = useState('')
  const seasonPlayers = useMemo(() => normalizePlayerGroups(team, season, data?.players)
    .flatMap((group) => group.rows)
    .map((player) => ({ type: 'Player', title: player.name, detail: `${seasonLabel(team, season)} ${player.position ?? 'player'}`, teamKey: team.key })), [team, season, data])
  const entries = useMemo(() => {
    const byId = new Map([...allArchiveEntries(), ...seasonPlayers].map((entry) => [`${entry.teamKey}:${entry.type}:${entry.title}`, entry]))
    return [...byId.values()]
  }, [seasonPlayers])
  const results = query.trim().length < 2 ? [] : entries.filter((entry) => `${entry.title} ${entry.detail} ${teamByKey(entry.teamKey).name}`.toLowerCase().includes(query.toLowerCase())).slice(0, 30)
  return (
    <div className="archive-body">
      <label className="archive-search">
        <span>Search Chicago players and archive moments</span>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Try Jordan, Payton, 2016…" autoComplete="off" />
      </label>
      <p className="archive-help">Searches Chicago legends across all five clubs plus every player in the selected {seasonLabel(team, season)} season feed.</p>
      <div className="search-results" aria-live="polite">
        {query.trim().length >= 2 && !results.length ? <p className="archive-empty">No matching archive entries.</p> : null}
        {results.map((entry) => <SearchResult key={`${entry.teamKey}:${entry.type}:${entry.title}`} entry={entry} favorites={favorites} toggle={toggleFavorite} />)}
      </div>
    </div>
  )
}

function FavoritesView({ favorites, toggleFavorite }) {
  return (
    <div className="archive-body search-results">
      {favorites.length ? favorites.map((entry) => <SearchResult key={entry.id} entry={entry} favorites={favorites} toggle={toggleFavorite} />) : (
        <div className="archive-empty">Your saved players, moments, records, and season cards will live here on this device.</div>
      )}
    </div>
  )
}

function SearchResult({ entry, favorites, toggle }) {
  const team = teamByKey(entry.teamKey)
  return (
    <article className="search-result">
      <span style={{ color: team.color }}>{team.short} · {entry.type}</span>
      <div><strong>{entry.title}</strong><p>{entry.detail}</p></div>
      <FavoriteButton entry={entry} favorites={favorites} toggle={toggle} />
    </article>
  )
}

function FavoriteButton({ entry, favorites, toggle }) {
  const id = entry.id ?? `${entry.teamKey}:${entry.type}:${entry.title}`
  const saved = favorites.some((item) => item.id === id)
  return <button className="favorite-button" aria-pressed={saved} onClick={() => toggle(entry)}>{saved ? '★ Saved' : '☆ Save'}</button>
}

function SourceLink({ data, compact = false }) {
  return <a className="archive-source" href={data.source.url} target="_blank" rel="noreferrer">{compact ? 'Source' : `Official source: ${data.source.label}`} ↗</a>
}

function Stat({ label, value }) { return <div><span>{label}</span><strong>{value}</strong></div> }

function CompareRow({ label, a, b, lower = false }) {
  const an = Number(String(a).replace(/[^0-9.-]/g, ''))
  const bn = Number(String(b).replace(/[^0-9.-]/g, ''))
  const aWins = Number.isFinite(an) && Number.isFinite(bn) && (lower ? an < bn : an > bn)
  const bWins = Number.isFinite(an) && Number.isFinite(bn) && (lower ? bn < an : bn > an)
  return <div className="compare-row"><strong className={aWins ? 'winner' : ''}>{a}</strong><span>{label}</span><strong className={bWins ? 'winner' : ''}>{b}</strong></div>
}

function normalizePlayerGroups(team, season, payload) {
  if (!payload) return []
  const past = isHistorical(team, season)
  if (team.sport === 'baseball') return mlbPlayerStats(payload, team.mlbId)
  if (team.sport === 'hockey' && past) return nhlPlayerStats(payload)
  if (team.sport === 'football' && past) return nflPlayerStats(payload, team.abbr)
  if (team.sport === 'basketball' && past) return nbaPlayerStats(payload)
  return espnPlayerStats(payload)
}

function margin(game) { return Number(game.ourScore) - Number(game.theirScore) }

function longestWinStreak(games) {
  let best = 0
  let run = 0
  games.forEach((game) => { run = game.result === 'W' ? run + 1 : 0; best = Math.max(best, run) })
  return best
}

function seasonMetrics(games) {
  const record = recordFromGames(games)
  const scored = games.reduce((sum, game) => sum + (Number(game.ourScore) || 0), 0)
  const allowed = games.reduce((sum, game) => sum + (Number(game.theirScore) || 0), 0)
  const wins = games.filter((game) => game.result === 'W')
  return { record, scored, allowed, streak: longestWinStreak(games), biggest: wins.length ? Math.max(...wins.map(margin)) : 0 }
}

function pct(record) { return record.played ? (record.w / record.played).toFixed(3).replace(/^0/, '') : '—' }

function seasonSummary(team, season, record, postseason, streak) {
  if (!record.played) return 'This season is waiting for its first completed chapter.'
  const title = ARCHIVE[team.key].championships.includes(Number(season))
  return `${record.w} wins and ${record.l} losses${record.t ? ` with ${record.t} ties` : ''}. ${streak ? `The longest winning run reached ${streak} games. ` : ''}${title ? 'It ended with a championship banner.' : postseason.played ? `The postseason record was ${postseason.text}.` : 'No postseason games are listed.'}`
}

function firstStat(player) {
  const index = player.values?.findIndex((value) => value !== '—' && value !== '' && value != null) ?? -1
  return index >= 0 ? `${player.columns[index]} ${player.values[index]}` : 'Season roster'
}

function compactDate(value) { return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' }).format(new Date(value)) }
function longDate(value) { return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`)) }

async function shareSeasonCard(card) {
  const url = window.location.href
  if (navigator.share) {
    try { await navigator.share({ title: card.title, text: card.detail, url }); return } catch { /* cancelled or unavailable */ }
  }
  try { await navigator.clipboard.writeText(`${card.title} — ${card.detail} ${url}`) } catch { window.prompt('Copy this season card', `${card.title} — ${card.detail} ${url}`) }
}

function downloadSeasonCard(team, card) {
  const canvas = document.createElement('canvas')
  canvas.width = 1200
  canvas.height = 630
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#eee8d7'; ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#171a2d'; ctx.fillRect(38, 38, 1124, 554)
  ctx.fillStyle = team.color; ctx.fillRect(52, 52, 1096, 28)
  ctx.fillStyle = '#fffaf0'; ctx.fillRect(52, 80, 1096, 498)
  ctx.fillStyle = '#171a2d'; ctx.font = 'bold 30px monospace'; ctx.fillText('CHICAGO SPORTS ARCHIVE', 92, 145)
  ctx.fillStyle = team.color; ctx.font = 'bold 66px monospace'; ctx.fillText(card.title.toUpperCase(), 92, 280)
  ctx.fillStyle = '#171a2d'; ctx.font = 'bold 42px monospace'; ctx.fillText(card.detail, 92, 375)
  ctx.font = '28px monospace'; ctx.fillText('chicagosports.vercel.app', 92, 510)
  const link = document.createElement('a')
  link.download = `${team.key}-${card.title.replace(/\W+/g, '-').toLowerCase()}.png`
  link.href = canvas.toDataURL('image/png')
  link.click()
}
