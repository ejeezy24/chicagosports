import { useEffect, useMemo, useState } from 'react'
import { ARCHIVE } from '../archiveData.js'
import { Panel } from './ui.jsx'
import { accentFor } from '../teams.js'
import { curatedPlayers, clearLineup, lineupEntries, lineupFromHash, lineupHash, placePlayer, readSavedLineup, removePlayer, slotsFor, writeSavedLineup } from '../lineup.js'
import { copyText } from '../share.js'
import '../lineup.css'

export function LineupBuilder({ team }) {
  const [lineup, setLineup] = useState(() => lineupFromHash(window.location.hash, team) ?? readSavedLineup(team))
  const [customName, setCustomName] = useState('')
  const [customEra, setCustomEra] = useState('')
  const [selectedPlayer, setSelectedPlayer] = useState('')
  const [selectedSlot, setSelectedSlot] = useState('')
  const [dragged, setDragged] = useState(null)
  const [storageError, setStorageError] = useState(false)
  const [copyStatus, setCopyStatus] = useState('')
  const players = useMemo(() => curatedPlayers(team), [team])
  const slots = useMemo(() => slotsFor(team), [team])
  const occupied = new Set(lineupEntries(lineup).map((entry) => entry.id))
  const available = players.filter((entry) => !occupied.has(entry.id))
  const place = (slot, entry) => setLineup((current) => placePlayer(current, slot, entry, team))
  useEffect(() => { setStorageError(!writeSavedLineup(team, lineup)) }, [team, lineup])
  const addCustom = () => {
    const name = customName.trim()
    if (!name || !selectedSlot) return
    place(selectedSlot, { id: `custom:${name.toLocaleLowerCase()}:${customEra.trim().toLocaleLowerCase()}`, name, era: customEra, sourceType: 'custom' })
    setCustomName(''); setCustomEra('')
  }
  const addSelected = () => {
    const entry = players.find((candidate) => candidate.id === selectedPlayer)
    if (entry && selectedSlot) place(selectedSlot, entry)
  }
  const copyShare = async () => {
    const hash = lineupHash(lineup, team)
    if (!hash) return setCopyStatus('Lineup is too large to share.')
    const url = `${window.location.origin}${window.location.pathname}?team=${team.key}&tab=lineup${hash}`
    const result = await copyText(url)
    setCopyStatus(result === 'copied' ? 'Share link copied.' : result === 'manual' ? 'Share link ready to copy.' : 'Could not copy the link. Please try again.')
  }
  const onDrop = (slot) => { if (dragged) { place(slot, dragged); setDragged(null) } }
  return <Panel title={`${team.short} all-time lineup`} aside={`${lineupEntries(lineup).length}/${slots.length} filled`} note="A fan-built depth chart from curated club legends. Positions are your call; custom entries carry no invented statistics.">
    <div className="lineup-builder" style={{ '--lineup-accent': accentFor(team) }}>
      <div className="lineup-actions"><button className="pixel-button" onClick={copyShare}>Share lineup</button><button className="text-button" onClick={() => setLineup(clearLineup(team))}>Clear lineup</button>{storageError ? <span role="status">This device could not save the lineup.</span> : null}{copyStatus ? <span role="status">{copyStatus}</span> : null}</div>
      <div className="lineup-add" aria-label="Add player to lineup">
        <label>Legend<select aria-label="Legend" value={selectedPlayer} onChange={(event) => setSelectedPlayer(event.target.value)}><option value="">Choose a curated legend</option>{available.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
        <label>Position<select aria-label="Position" value={selectedSlot} onChange={(event) => setSelectedSlot(event.target.value)}><option value="">Choose a slot</option>{slots.map((slot) => <option key={slot} value={slot}>{slot}</option>)}</select></label>
        <button className="pixel-button" disabled={!selectedPlayer || !selectedSlot} onClick={addSelected}>Add legend</button>
        <label>Custom player<input value={customName} maxLength={80} onChange={(event) => setCustomName(event.target.value)} placeholder="Player name" /></label>
        <label>Era <span className="muted">(optional)</span><input value={customEra} maxLength={60} onChange={(event) => setCustomEra(event.target.value)} placeholder="e.g. 1985–90" /></label>
        <button className="pixel-button" disabled={!customName.trim() || !selectedSlot} onClick={addCustom}>Add custom</button>
      </div>
      <div className="legend-pool" aria-label="Legends bench">{available.map(entry => <button key={entry.id} type="button" draggable aria-pressed={selectedPlayer === entry.id} onClick={() => setSelectedPlayer(entry.id)} onDragStart={event => { event.dataTransfer.setData("text/plain", entry.id); setDragged(entry) }} onDragEnd={() => setDragged(null)}><strong>{entry.name}</strong><small>Drag to a slot or select above</small></button>)}</div><div className="lineup-slots" aria-label={`${team.short} lineup slots`}>{slots.map((slot) => { const entry = lineup.slots[slot]; return <div className={`lineup-slot${entry ? ' filled' : ''}`} key={slot} onDragOver={(event) => event.preventDefault()} onDrop={() => onDrop(slot)}><div className="lineup-slot-head"><strong>{slot}</strong>{entry ? <button className="text-button" onClick={() => setLineup(removePlayer(lineup, slot, team))}>Remove</button> : null}</div>{entry ? <div draggable onDragStart={() => setDragged(entry)} className="lineup-player"><strong>{entry.name}</strong><small>{entry.era}</small><label className="lineup-move">Move to<select aria-label={`Move ${entry.name} to position`} value={slot} onChange={event => place(event.target.value, entry)}>{slots.map(destination => <option key={destination} value={destination}>{destination}</option>)}</select></label>{entry.sourceUrl ? <a href={entry.sourceUrl} target="_blank" rel="noreferrer">{entry.sourceLabel}</a> : <small>User-entered · no stats added</small>}</div> : <span className="lineup-empty">Drop or add a player</span>}</div> })}</div>
      <p className="lineup-source">Curated legend names and source links come from <a href={ARCHIVE[team.key]?.source?.url} target="_blank" rel="noreferrer">{ARCHIVE[team.key]?.source?.label ?? 'team history'}</a>. Editorial selection; positions are fan-assigned.</p>
    </div>
  </Panel>
}
