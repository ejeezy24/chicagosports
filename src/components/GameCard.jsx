import { useId, useState } from 'react'
import { useFan } from '../FanContext.jsx'
import { gameKey, isCancelled } from '../fan.js'
import { calendarGames, downloadCalendar } from '../calendar.js'
import { formatDate, formatTime, isSameDay } from '../format.js'
import { LiveGameCenter } from './LiveGameCenter.jsx'
import { Venue } from './Venue.jsx'

export function GameCard({ game, team, defaultOpen = false, showTeam = false }) {
  const fan = useFan()
  const key = gameKey(team, game)
  const visible = fan.visible(key)
  const ticket = fan.tickets[key]
  const [open, setOpen] = useState(defaultOpen)
  const [editing, setEditing] = useState(false)
  const panelId = useId()
  const canExpand = Boolean(game.id) && game.hasBoxscore !== false && (game.completed || game.state === 'in')
  const canCalendar = calendarGames([game]).length > 0
  return <article className={`game-card${isSameDay(game.date) ? ' today-card' : ''}`}>
    <div className="game-main">
      <div className="game-date">{formatDate(game.date, { withYear: true })}<small>{game.completed ? 'Final' : game.timeTbd ? 'TBD' : formatTime(game.date)} · Chicago time</small></div>
      <div className="game-matchup">
        {game.opponent.logo ? <img width="30" height="30" src={game.opponent.logo} alt="" loading="lazy" /> : null}
        <div><strong>{showTeam ? `${team.short} ` : ''}{game.home ? 'vs' : '@'} {game.opponent.name}</strong>
          <div className="game-meta">{game.neutral ? 'Neutral site · ' : ''}{game.venue ? <Venue name={game.venue} /> : null}{game.broadcast ? ` · ${game.broadcast}` : ''}</div>
          {visible && game.note ? <div className="game-meta">{game.note}</div> : null}
        </div>
      </div>
      <div className="game-score">
        {!visible && (game.completed || game.state === 'in') ? <button className="pixel-button" onClick={() => fan.reveal(key)}>Reveal score</button>
          : game.completed || game.state === 'in' ? <><span className={game.state === 'in' ? 'livedot' : `badge ${game.result?.toLowerCase()}`}>{game.state === 'in' ? 'LIVE' : game.result ?? 'F'}</span><strong>{game.ourScore ?? '—'}–{game.theirScore ?? '—'}</strong>{game.state === 'in' ? <small>{game.detail}</small> : null}</>
          : <span>{isCancelled(game) || /delay/i.test(game.detail ?? '') ? game.detail : 'Upcoming'}</span>}
      </div>
    </div>
    <div className="game-actions">
      <button className="text-button" aria-expanded={editing} onClick={() => setEditing((v) => !v)}>{ticket ? '★ Edit ticket' : '+ Collect ticket'}</button>
      {canCalendar ? <button className="text-button" onClick={() => downloadCalendar(team, [game])}>Add to calendar</button> : null}
      {canExpand ? <button className="text-button" aria-expanded={open && visible} aria-controls={panelId} onClick={() => { if (!visible) fan.reveal(key); setOpen((v) => !visible || !v) }}>{open && visible ? '− Hide' : '+ Show'} boxscore</button> : null}
    </div>
    {editing ? <TicketEditor key={key} team={team} game={game} onClose={() => setEditing(false)} /> : null}
    {canExpand && open && visible ? <div id={panelId} className="game-detail-reveal"><LiveGameCenter team={team} eventId={game.id} live={game.state === 'in'} /></div> : null}
  </article>
}

export function TicketEditor({ team, game, onClose }) {
  const fan = useFan()
  const ticket = fan.tickets[gameKey(team, game)]
  const [kind, setKind] = useState(ticket?.kind ?? 'attended')
  const [note, setNote] = useState(ticket?.note ?? '')
  const id = useId()
  return <form className="ticket-editor" onSubmit={(event) => { event.preventDefault(); fan.saveTicket(team, game, kind, note); onClose() }}>
    <label htmlFor={`${id}-kind`}>How did you follow this game?</label>
    <select id={`${id}-kind`} value={kind} onChange={(event) => setKind(event.target.value)}><option value="attended">I attended</option><option value="watched">I watched</option></select>
    <label htmlFor={`${id}-note`}>Your memory <span className="muted">(optional)</span></label>
    <textarea id={`${id}-note`} maxLength={500} rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Who you went with, your favorite moment…" />
    <div className="action-row"><button className="pixel-button primary" type="submit">Save ticket</button><button className="pixel-button" type="button" onClick={onClose}>Cancel</button>{ticket ? <button className="text-button" type="button" onClick={() => { fan.removeTicket(gameKey(team, game)); onClose() }}>Remove ticket</button> : null}</div>
    <small>Saved on this device. {note.length}/500 characters.</small>
  </form>
}
