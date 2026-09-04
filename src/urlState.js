// The query string is the app's address bar: ?team=cubs&season=2015&tab=roster.
//
// Everything here is pure and DOM-free so it can be tested in plain Node, which
// is why the effects that read and write `window.location` live next door in
// useUrlSync.js instead.

import { TEAMS, teamByKey } from './teams.js'
import { DEFAULT_TAB, isTab } from './tabs.js'
import { clampSeason, currentSeasonFor } from './seasons.js'

export const DEFAULT_TEAM = 'cubs'
export const ARCHIVE_VIEWS = ['story', 'compare', 'history', 'records', 'rivalries', 'search', 'favorites']

const isTeamKey = (key) => TEAMS.some((t) => t.key === key)

/**
 * Only the parameters that are present *and* valid. Nothing is defaulted here —
 * the caller needs to tell "absent" from "nonsense" so each key can fall back
 * separately, and a link carrying only `?tab=roster` still works.
 */
export function parseParams(search) {
  const params = new URLSearchParams(search ?? '')
  const out = {}

  const team = params.get('team')
  if (team && isTeamKey(team)) out.teamKey = team

  // Insist on four digits before trusting it to clampSeason, which maps NaN to
  // the current season (fine) but `2` to the club's oldest (surprising). This
  // way ?season=abc and ?season=2 both land on the current season, while a real
  // 1912 still clamps to the earliest the club has.
  const season = params.get('season')
  if (season && /^\d{4}$/.test(season)) out.season = Number(season)

  const tab = params.get('tab')
  if (tab && isTab(tab)) out.tab = tab

  const older = params.get('older')
  if (older !== null) out.older = older === '1' || older === 'true' || older === 'yes'

  const view = params.get('view')
  if (view && ARCHIVE_VIEWS.includes(view)) out.archiveView = view

  const game = params.get('game')
  if (game && /^[A-Za-z0-9_-]{1,80}$/.test(game)) out.gameId = game

  const seasonType = params.get('type')
  if (seasonType && /^[1-3]$/.test(seasonType)) out.seasonType = Number(seasonType)

  return out
}

/**
 * The whole resolution in one place: a complete, self-consistent state from
 * whatever the URL happened to contain.
 *
 * The `includeOlder` line is what makes deep links survive mount. App.jsx has an
 * effect that snaps `season` back whenever it isn't in the visible options list,
 * and that list starts at the club's `modernFrom` (2002-2004) unless the older
 * seasons box is ticked. Deriving the tick from the season satisfies that
 * invariant *before* the first render, so the effect observes instead of
 * overwriting. A season therefore outranks an explicit `older=0`: honouring the
 * flag instead would silently throw away the year someone linked to.
 */
export function resolveState(search, storedTeamKey, now = new Date()) {
  const params = parseParams(search)

  const teamKey = params.teamKey ?? (isTeamKey(storedTeamKey) ? storedTeamKey : DEFAULT_TEAM)
  const team = teamByKey(teamKey)

  const season =
    params.season !== undefined ? clampSeason(team, params.season, now) : currentSeasonFor(team, now)

  const tab = params.tab ?? DEFAULT_TAB
  return {
    teamKey,
    season,
    tab,
    archiveView: tab === 'archive' ? params.archiveView ?? 'story' : 'story',
    seasonType: tab === 'schedule' && team.seasonTypes.some((type) => type.id === params.seasonType) ? params.seasonType : 2,
    gameId: tab === 'schedule' ? params.gameId ?? null : null,
    includeOlder: (params.older ?? false) || season < team.modernFrom,
  }
}

/**
 * The canonical query string. Key order is fixed so a plain string comparison is
 * a valid "has the URL changed?" test, which useUrlSync depends on. Anything the
 * app doesn't recognise is carried through, so sharing a link doesn't eat
 * someone's campaign parameters.
 */
export function toSearch(state, base = '') {
  const params = new URLSearchParams(base)

  for (const key of ['team', 'season', 'tab', 'older', 'view', 'type', 'game']) params.delete(key)
  const extras = params.toString()

  const mine = new URLSearchParams()
  mine.set('team', state.teamKey)
  mine.set('season', String(state.season))
  mine.set('tab', state.tab)
  if (state.tab === 'archive' && state.archiveView && state.archiveView !== 'story') mine.set('view', state.archiveView)
  if (state.tab === 'schedule' && state.seasonType && state.seasonType !== 2) mine.set('type', String(state.seasonType))
  if (state.tab === 'schedule' && state.gameId) mine.set('game', state.gameId)
  if (state.includeOlder) mine.set('older', '1')

  return `?${mine.toString()}${extras ? `&${extras}` : ''}`
}

export function gameLink(href, gameId) {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(String(gameId ?? ''))) return null
  try {
    const url = new URL(href)
    url.searchParams.set('game', String(gameId))
    return url.href
  } catch {
    return null
  }
}
