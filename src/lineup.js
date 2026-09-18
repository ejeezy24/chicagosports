import { ARCHIVE } from './archiveData.js'

export const LINEUP_SLOTS = {
  baseball: ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH', 'P'],
  football: ['QB', 'RB', 'WR', 'TE', 'OL', 'DL', 'LB', 'CB', 'S', 'K'],
  basketball: ['PG', 'SG', 'SF', 'PF', 'C'],
  hockey: ['C', 'LW', 'RW', 'LD', 'RD', 'G'],
}

const MAX_NAME = 80
const MAX_ERA = 60

export function slotsFor(team) {
  return [...(LINEUP_SLOTS[team?.sport] ?? [])]
}

export function blankLineup(team) {
  return { version: 1, teamKey: team.key, slots: Object.fromEntries(slotsFor(team).map((slot) => [slot, null])) }
}

export function curatedPlayers(team, archive = ARCHIVE) {
  const data = archive[team.key]
  if (!data) return []
  return [...new Set(data.legends ?? [])].map((name) => ({
    id: `legend:${team.key}:${name.toLocaleLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    name,
    era: 'Curated club legend',
    sourceType: 'curated',
    sourceUrl: data.source?.url ?? null,
    sourceLabel: data.source?.label ?? 'Team history',
  }))
}

export function cleanEntry(entry, team) {
  if (!entry || typeof entry !== 'object') return null
  const known = curatedPlayers(team).find(player => player.id === entry.id)
  if (known) return known
  const name = typeof entry.name === 'string' ? entry.name.trim().slice(0, MAX_NAME) : ''
  if (!name) return null
  const era = String(entry.era ?? '').trim().slice(0, MAX_ERA)
  const id = String(entry.id ?? `custom:${name.toLocaleLowerCase()}:${era.toLocaleLowerCase()}`).slice(0, 180)
  return { id, name, era, sourceType: 'custom', sourceUrl: null, sourceLabel: null }
}

export function normalizeLineup(raw, team) {
  const empty = blankLineup(team)
  if (!raw || raw.teamKey !== team.key || !raw.slots || typeof raw.slots !== 'object') return empty
  const seen = new Set()
  for (const slot of slotsFor(team)) {
    const entry = cleanEntry(raw.slots[slot], team)
    if (!entry || seen.has(entry.id)) continue
    seen.add(entry.id)
    empty.slots[slot] = entry
  }
  return empty
}

export function placePlayer(lineup, slot, entry, team) {
  const normalized = normalizeLineup(lineup, team)
  if (!slotsFor(team).includes(slot)) return normalized
  const clean = cleanEntry(entry, team)
  if (!clean) return normalized
  const previousSlot = Object.keys(normalized.slots).find(key => normalized.slots[key]?.id === clean.id)
  if (previousSlot && previousSlot !== slot) normalized.slots[previousSlot] = normalized.slots[slot]
  normalized.slots[slot] = clean
  return normalized
}

export function removePlayer(lineup, slot, team) {
  const normalized = normalizeLineup(lineup, team)
  if (slot in normalized.slots) normalized.slots[slot] = null
  return normalized
}

export function clearLineup(team) {
  return blankLineup(team)
}

export function lineupEntries(lineup) {
  return Object.values(lineup?.slots ?? {}).filter(Boolean)
}

export function lineupStorageKey(team) {
  return `cs.lineup.v1:${team.key}`
}

export function readSavedLineup(team, storage) {
  try { return normalizeLineup(JSON.parse((storage ?? globalThis.localStorage).getItem(lineupStorageKey(team)) ?? 'null'), team) }
  catch { return blankLineup(team) }
}

export function writeSavedLineup(team, lineup, storage) {
  try { (storage ?? globalThis.localStorage).setItem(lineupStorageKey(team), JSON.stringify(normalizeLineup(lineup, team))); return true }
  catch { return false }
}

const encode = (value) => {
  const bytes = new TextEncoder().encode(JSON.stringify(value))
  let binary = ''
  bytes.forEach((byte) => { binary += String.fromCharCode(byte) })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

const decode = (value) => {
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4))
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0))))
}

export function lineupHash(lineup, team, maxLength = 12000) {
  const value = encode(normalizeLineup(lineup, team))
  return value.length <= maxLength ? `#lineup=${value}` : null
}

export function lineupFromHash(hash, team) {
  const match = String(hash ?? '').match(/(?:^#|&)lineup=([^&]+)/)
  if (!match || match[1].length > 12000) return null
  try { return normalizeLineup(decode(match[1]), team) } catch { return null }
}
