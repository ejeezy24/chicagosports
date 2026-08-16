// Which season is "now" depends on the league's calendar, and NBA/NHL seasons
// are keyed by their ending year. Everything here works in terms of the ESPN
// season id (a number); `seasonLabel` turns it back into something readable.

export function currentSeasonFor(team, now = new Date()) {
  const year = now.getFullYear()
  const month = now.getMonth() + 1 // 1-12

  switch (team.league) {
    // Spring training starts in Feb/Mar; Jan-Feb still belongs to last season.
    case 'mlb':
      return month >= 3 ? year : year - 1
    // The NFL schedule drops in May and the playoffs run into February, so
    // Jan-Apr is still the previous season.
    case 'nfl':
      return month >= 5 ? year : year - 1
    // NBA/NHL open in October and are labelled by the ending year, so anything
    // from September onward belongs to the season ending next year.
    default:
      return month >= 9 ? year + 1 : year
  }
}

/**
 * NBA and NHL seasons are still the newest option during July and August even
 * though their games are over. Treat that short off-season window as archive
 * data so a 2025-26 page does not accidentally show a 2026-27 roster.
 */
export function seasonIsComplete(team, season, now = new Date()) {
  const current = currentSeasonFor(team, now)
  if (Number(season) < Number(current)) return true
  if (Number(season) > Number(current)) return false

  const month = now.getMonth() + 1
  return ['nba', 'nhl'].includes(team.league) && month >= 7 && month < 9
}

export function seasonLabel(team, season) {
  if (team.seasonStyle !== 'split') return String(season)
  return `${season - 1}-${String(season).slice(-2)}`
}

/** Seasons a team can be asked about, newest first. */
export function seasonOptions(team, { includeOlder = false, now = new Date() } = {}) {
  const newest = currentSeasonFor(team, now)
  const oldest = includeOlder ? team.oldestSeason : team.modernFrom
  const out = []
  for (let s = newest; s >= oldest; s--) out.push(s)
  return out
}

/** Keep a chosen year usable when the user switches to another team. */
export function clampSeason(team, season, now = new Date()) {
  const newest = currentSeasonFor(team, now)
  if (!Number.isFinite(season)) return newest
  return Math.min(Math.max(season, team.oldestSeason), newest)
}
