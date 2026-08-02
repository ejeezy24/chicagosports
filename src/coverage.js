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
    players: 'Player stats: current Bears players only.',
  },
  basketball: {
    roster: 'Roster: unavailable.',
    players: 'Player stats: current Bulls players only.',
  },
}

/** A compact, honest summary of what an older season can show before a fan opens a tab. */
export function coverageNote(team, season, now) {
  if (Number(season) === Number(currentSeasonFor(team, now))) return null

  const source = ARCHIVE_SOURCES[team.sport]
  return {
    label: `${seasonLabel(team, season)} archive coverage —`,
    detail: `Schedules, scores, team stats, and standings are available. ${source.roster} ${source.players}`,
  }
}
