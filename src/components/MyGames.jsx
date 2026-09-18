import { useEffect, useState } from 'react'
import { useFan, SpoilerGate } from '../FanContext.jsx'
import { TEAMS, teamByKey, accentFor } from '../teams.js'
import { gameKey, seasonSummary } from '../fan.js'
import { formatDate } from '../format.js'
import { getSummary } from '../api.js'
import { normalizeEvent } from '../espn.js'
import { useAsync } from '../useAsync.js'
import { Panel } from './ui.jsx'
import { TicketEditor, GameCard } from './GameCard.jsx'

export function MyGames({ onBrowse }) {
  const fan = useFan()
  const [club, setClub] = useState('all')
  const [kind, setKind] = useState('all')
  const tickets = Object.values(fan.tickets)
  const pending = tickets.filter((t) => !t.game.completed && t.game.id)
  const pendingKey = pending.map((t) => gameKey(teamByKey(t.teamKey), t.game)).sort().join('|')
  const refresh = useAsync(async ({ fresh }) => {
    const results = await Promise.allSettled(pending.map(async (ticket) => {
      const team = teamByKey(ticket.teamKey)
      const payload = await getSummary(team, ticket.game.id, { fresh })
      if (!payload?.header?.competitions?.length) throw new Error('Game result not published')
      const game = normalizeEvent({ ...payload.header, id: ticket.game.id }, team.espnId)
      return [gameKey(team, ticket.game), { ...ticket.game, ...game, venue: game.venue ?? ticket.game.venue, broadcast: game.broadcast ?? ticket.game.broadcast, date: game.date ?? ticket.game.date }]
    }))
    return { updates: Object.fromEntries(results.filter((r) => r.status === 'fulfilled').map((r) => r.value)), failed: results.filter((r) => r.status === 'rejected').length }
  }, [pendingKey])
  const mergeTicketGames = fan.mergeTicketGames
  useEffect(() => { if (refresh.data && Object.keys(refresh.data.updates).length) mergeTicketGames(refresh.data.updates) }, [refresh.data, mergeTicketGames])
  const filtered = tickets.filter((t) => (club === 'all' || t.teamKey === club) && (kind === 'all' || t.kind === kind)).sort((a, b) => new Date(b.game.date) - new Date(a.game.date))
  return <Panel title="My Games" aside={`${tickets.length} ticket${tickets.length === 1 ? '' : 's'}`}>
    <div className="feature-intro"><span className="eyebrow">Your own little hall of fame</span><h2>Keep the games. Keep the memories.</h2><p>Collect games you attended or watched, leave a memory, and see how your teams perform when you’re there. Saved on this device.</p></div>
    {tickets.length ? <>
      <div className="filter-bar"><label>Team<select value={club} onChange={(e) => setClub(e.target.value)}><option value="all">All teams</option>{TEAMS.map((t) => <option key={t.key} value={t.key}>{t.short}</option>)}</select></label><label>Experience<select value={kind} onChange={(e) => setKind(e.target.value)}><option value="all">Attended + watched</option><option value="attended">I attended</option><option value="watched">I watched</option></select></label>{pending.length ? <button className="pixel-button" disabled={refresh.loading} onClick={refresh.refresh}>Refresh saved results</button> : null}</div>
      {refresh.data?.failed ? <p className="micro-note" role="status">Some saved results couldn’t be updated. Your tickets are still here.</p> : null}
      <SpoilerGate scope={`personal-record:${club}:${kind}`} label="personal records"><div className="personal-records">{TEAMS.filter((t) => filtered.some((ticket) => ticket.teamKey === t.key)).map((t) => { const summary = seasonSummary(filtered.filter((ticket) => ticket.teamKey === t.key).map((ticket) => ticket.game)); return <div key={t.key}><strong>{t.short}</strong><b>{summary.played ? summary.record : '—'}</b><span>{summary.played} completed · {kind === 'attended' ? 'when you attended' : kind === 'watched' ? 'when you watched' : 'your collected games'}</span></div> })}</div></SpoilerGate>
      <p className="micro-note">Personal records count saved games with final scores. Hockey losses include overtime and shootouts.</p>
      <div className="ticket-grid">{filtered.map((ticket) => <Ticket key={gameKey(teamByKey(ticket.teamKey), ticket.game)} ticket={ticket} />)}</div>
      {!filtered.length ? <div className="state">No tickets match these filters.</div> : null}
    </> : <div className="collection-empty"><span className="ticket-outline" aria-hidden="true">ADMIT ONE<br />★ ★ ★</span><h3>Your first ticket is waiting.</h3><p>Open a game and choose “Collect ticket” to start your collection.</p><button className="pixel-button primary" onClick={onBrowse}>Find a game</button></div>}
  </Panel>
}

function Ticket({ ticket }) {
  const fan = useFan()
  const team = teamByKey(ticket.teamKey)
  const key = gameKey(team, ticket.game)
  const visible = fan.visible(key)
  const [editing, setEditing] = useState(false)
  const [details, setDetails] = useState(false)
  return <article className="ticket" style={{ '--ticket-color': accentFor(team) }}><div className="ticket-top"><span>{ticket.kind === 'attended' ? 'Admit one · I was there' : 'Watch party · I watched'}</span><span>★</span></div><div className="ticket-body"><span className="eyebrow">{formatDate(ticket.game.date, { withYear: true })}</span><h3>{team.short}<span>{ticket.game.home ? 'vs' : '@'} {ticket.game.opponent.name}</span></h3>
    <p className="muted">{ticket.game.venue}</p>
    {visible ? <><strong className="ticket-score">{ticket.game.completed ? `${ticket.game.result ?? 'Final'} · ${ticket.game.ourScore ?? '—'}–${ticket.game.theirScore ?? '—'}` : 'Result pending'}</strong>{ticket.note ? <p className="ticket-memory">“{ticket.note}”</p> : null}</> : <button className="pixel-button" onClick={() => fan.reveal(key)}>Reveal result & memory</button>}
    <div className="action-row"><button className="text-button" aria-expanded={editing} onClick={() => setEditing((v) => !v)}>Edit ticket</button><button className="text-button" aria-expanded={details} onClick={() => setDetails((v) => !v)}>{details ? 'Hide' : 'Game'} details</button></div>
    {editing ? <TicketEditor team={team} game={ticket.game} onClose={() => setEditing(false)} /> : null}
    {details ? <GameCard team={team} game={ticket.game} /> : null}
  </div><div className="ticket-bottom"><span>CHICAGO SPORTS</span><span className="barcode" aria-hidden="true" /></div></article>
}

