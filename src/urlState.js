// The query string is the app's address bar: ?team=cubs&season=2015&tab=roster.
//
// Everything here is pure and DOM-free so it can be tested in plain Node, which
// is why the effects that read and write `window.location` live next door in
// useUrlSync.js instead.

import { TEAMS, teamByKey } from './teams.js'
import { DEFAULT_TAB, isTab } from './tabs.js'
import { clampSeason, currentSeasonFor } from './seasons.js'

export const DEFAULT_TEAM = 'cubs'

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

  return {
    teamKey,
    season,
    tab: params.tab ?? DEFAULT_TAB,
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

  for (const key of ['team', 'season', 'tab', 'older']) params.delete(key)
  const extras = params.toString()

  const mine = new URLSearchParams()
  mine.set('team', state.teamKey)
  mine.set('season', String(state.season))
  mine.set('tab', state.tab)
  if (state.includeOlder) mine.set('older', '1')

  return `?${mine.toString()}${extras ? `&${extras}` : ''}`
}
