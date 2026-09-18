import { currentSeasonFor } from './seasons.js'

const first = (...values) => values.find((value) => value !== undefined && value !== null && value !== '')
const numberOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function seasonValue(payload) {
  const value = payload?.season ?? payload?.seasonYear ?? payload?.meta?.season
  return numberOrNull(typeof value === 'object' ? first(value?.year, value?.value, value?.slug) : value)
}

function statValue(stat) {
  return {
    key: stat?.name ?? stat?.abbreviation ?? stat?.type ?? null,
    label: first(stat?.shortDisplayName, stat?.displayName, stat?.abbreviation, stat?.name, 'Stat'),
    abbreviation: stat?.abbreviation ?? null,
    value: numberOrNull(first(stat?.value, stat?.displayValue)),
    displayValue: first(stat?.displayValue, stat?.value) ?? null,
    description: stat?.description ?? null,
  }
}

function walk(node, ancestry, out, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 8) return
  const label = first(node.name, node.displayName, node.abbreviation)
  const path = label ? [...ancestry, label] : ancestry
  const entries = node.standings?.entries
  if (Array.isArray(entries) && entries.length) {
    out.push({
      name: label ?? 'Standings',
      ancestry: path,
      rows: entries.map((entry) => ({
        id: entry.team?.id ?? entry.id ?? null,
        team: first(entry.team?.displayName, entry.team?.shortDisplayName, entry.team?.name, entry.note?.headline, 'Unknown'),
        abbr: entry.team?.abbreviation ?? '',
        logo: entry.team?.logos?.[0]?.href ?? null,
        stats: (entry.stats ?? []).map(statValue).filter((stat) => stat.key || stat.displayValue !== null),
      })),
    })
  }
  for (const child of node.children ?? []) walk(child, path, out, depth + 1)
}

export function normalizeRaceStandings(payload, requestedSeason) {
  const receivedSeason = seasonValue(payload)
  if (receivedSeason !== null && Number(receivedSeason) !== Number(requestedSeason)) return { seasonMismatch: true, groups: [], receivedSeason }
  const groups = []
  walk(payload, [], groups)
  return { seasonMismatch: false, groups, receivedSeason }
}

const canceled = /cancel(?:led|ed)|postponed|suspended|abandoned/i

export function normalizeRemaining(payload, team, requestedSeason) {
  const receivedSeason = seasonValue(payload)
  const eventSeasons = (payload?.events ?? []).map((event) => numberOrNull(event.season?.year)).filter((year) => year !== null)
  if (eventSeasons.some((year) => year !== Number(requestedSeason)) || (!eventSeasons.length && receivedSeason !== null && Number(receivedSeason) !== Number(requestedSeason))) return { seasonMismatch: true, games: [], receivedSeason }
  const games = []
  for (const event of payload?.events ?? []) {
    const competition = event.competitions?.[0] ?? {}
    const status = competition.status ?? event.status ?? {}
    const type = status.type ?? {}
    const text = [type.name, type.description, type.detail, type.shortDetail, competition.notes?.[0]?.headline].filter(Boolean).join(' ')
    if (canceled.test(text) || type.completed || type.state === 'post') continue
    const date = first(event.date, competition.date)
    if (!date || Number.isNaN(new Date(date).getTime())) continue
    const competitors = competition.competitors ?? []
    const us = competitors.find((entry) => String(entry.team?.id) === String(team.espnId))
    const opponent = competitors.find((entry) => entry !== us)
    if (!us || !opponent) continue
    games.push({
      id: event.id ?? competition.id ?? null,
      date,
      timeTbd: competition.timeValid === false || event.timeValid === false || /\btbd\b|tba|time (?:not announced|to be determined)/i.test(text),
      opponent: first(opponent.team?.displayName, opponent.team?.shortDisplayName, opponent.team?.abbreviation, 'Unknown'),
      home: us.homeAway === 'home',
      state: type.state ?? 'pre',
    })
  }
  return { seasonMismatch: false, games: games.sort((a, b) => new Date(a.date) - new Date(b.date)), receivedSeason }
}

export function isCurrentRaceSeason(team, season) {
  return Number(season) === Number(currentSeasonFor(team))
}

export function clinchingStatus(row) {
  const statuses = row.stats
    .filter((stat) => stat.key === 'clincher')
    .map((stat) => stat.description)
    .filter((description) => typeof description === 'string' && /clinched|eliminated/i.test(description))
  return statuses[0] ?? 'No clinching status reported.'
}

export function raceColumns(team, row) {
  const keys = team.sport === 'hockey'
    ? ['wins', 'losses', 'otLosses', 'points', 'gamesBehind']
    : team.sport === 'baseball'
      ? ['wins', 'losses', 'gamesBehind', 'winPercent']
      : ['wins', 'losses', 'ties', 'winPercent', 'gamesBehind']
  const columns = keys.map((key) => row.stats.find((stat) => stat.key === key || (key === 'gamesBehind' && stat.abbreviation === 'GB'))).filter(Boolean)
  const seed = row.stats.find((stat) => stat.key === 'playoffSeed' || stat.abbreviation === 'SEED')
  return seed ? [...columns, seed] : columns
}
