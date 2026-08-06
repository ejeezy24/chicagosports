import { currentSeasonFor, seasonLabel } from './seasons.js'

const ARCHIVE_SOURCES = {
  baseball: {
    roster: 'Roster: MLB archive.',
    players: 'Player stats: MLB archive.',
  },
  hockey: {
    roster: 'Roster: NHL archive.',
    players: 'Player stats: NHL archive.',
  },
  football: {
    roster: 'Roster: nflverse archive.',
    players: (season) =>
      Number(season) >= 1999
        ? 'Player stats: nflverse archive.'
        : 'Player stats: unavailable before 1999.',
  },
  basketball: {
    roster: 'Roster: NBA Stats archive.',
    players: 'Player stats: NBA Stats archive.',
  },
}

/** A compact, honest summary of what an older season can show before a fan opens a tab. */
export function coverageNote(team, season, now) {
  if (Number(season) === Number(currentSeasonFor(team, now))) return null

  const source = ARCHIVE_SOURCES[team.sport]
  const players =
    typeof source.players === 'function' ? source.players(season) : source.players
  return {
    label: `${seasonLabel(team, season)} archive coverage —`,
    detail: `Schedules, scores, team stats, and standings are available. ${source.roster} ${players}`,
  }
}
