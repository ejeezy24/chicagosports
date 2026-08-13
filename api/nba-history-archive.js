// Verified, in-repository snapshots keep landmark seasons available when the
// NBA Stats host throttles or blocks serverless data centers. This is source
// data, not scraped at request time. The 1995-96 rows were cross-checked with:
// - Basketball Reference: basketball-reference.com/teams/CHI/1996.html
// - RealGM: basketball.realgm.com/nba/teams/Chicago-Bulls/4/Rosters/Regular/1996
// - WhatIfSports totals: whatifsports.com/nba-l/profile_team.asp?hfid=4&season=1995-96

const roster = [
  ['Michael Jordan', '23', 'SG', 893],
  ['Scottie Pippen', '33', 'SF', 937],
  ['Dennis Rodman', '91', 'PF', 23],
  ['Ron Harper', '9', 'SG', 166],
  ['Luc Longley', '13', 'C', 915],
  ['Toni Kukoc', '7', 'SF', 389],
  ['Steve Kerr', '25', 'PG', 703],
  ['Bill Wennington', '34', 'C', 178],
  ['Dickey Simpkins', '8', 'PF', null],
  ['John Salley', '22', 'C', 22],
  ['Jud Buechler', '30', 'SF', null],
  ['Randy Brown', '0', 'PG', null],
  ['James Edwards', '53', 'C', null],
  ['Jason Caffey', '35', 'PF', null],
  ['Jack Haley', '44', 'C', null],
].map(([PLAYER, NUM, POSITION, PLAYER_ID]) => ({ PLAYER, NUM, POSITION, PLAYER_ID }))

const rows = [
  // name, GP, MIN, PTS, REB, AST, STL, BLK, TOV, FG%, 3P%, FT%
  ['Michael Jordan', 82, 37.7, 30.4, 6.6, 4.3, 2.2, 0.5, 2.4, .495, .427, .834, 893],
  ['Scottie Pippen', 77, 36.7, 19.4, 6.4, 5.9, 1.7, 0.7, 2.7, .463, .374, .679, 937],
  ['Toni Kukoc', 81, 26.0, 13.1, 4.0, 3.5, 0.8, 0.3, 1.4, .490, .403, .772, 389],
  ['Luc Longley', 62, 26.5, 9.1, 5.1, 1.9, 0.4, 1.4, 1.8, .482, .000, .777, 915],
  ['Steve Kerr', 82, 23.4, 8.4, 1.3, 2.3, 0.8, 0.0, 0.5, .506, .515, .929, 703],
  ['Ron Harper', 80, 23.6, 7.4, 2.7, 2.6, 1.3, 0.4, 0.9, .467, .269, .705, 166],
  ['Dennis Rodman', 64, 32.6, 5.5, 14.9, 2.5, 0.6, 0.4, 2.2, .480, .111, .528, 23],
  ['Bill Wennington', 71, 15.0, 5.3, 2.5, 0.6, 0.3, 0.2, 0.5, .493, 1.000, .860, 178],
  ['Jud Buechler', 74, 10.0, 3.8, 1.5, 0.8, 0.5, 0.1, 0.5, .463, .444, .636, null],
  ['Dickey Simpkins', 60, 11.4, 3.6, 2.6, 0.6, 0.1, 0.1, 0.9, .481, 1.000, .629, null],
  ['James Edwards', 28, 9.8, 3.5, 1.4, 0.4, 0.0, 0.3, 0.8, .373, .000, .615, null],
  ['Jason Caffey', 57, 9.6, 3.2, 1.9, 0.4, 0.2, 0.1, 0.8, .438, .000, .588, null],
  ['Randy Brown', 68, 9.9, 2.7, 1.0, 1.1, 0.8, 0.2, 0.5, .406, .091, .609, null],
  ['John Salley', 17, 11.2, 2.1, 2.5, 0.9, 0.5, 0.9, 0.9, .343, .000, .600, 22],
  ['Jack Haley', 1, 7.0, 5.0, 2.0, 0.0, 0.0, 0.0, 1.0, .333, .000, .500, null],
]

const players = rows.map(
  ([PLAYER_NAME, GP, MIN, PTS, REB, AST, STL, BLK, TOV, FG_PCT, FG3_PCT, FT_PCT, PLAYER_ID]) => ({
    PLAYER_NAME,
    PLAYER_ID,
    GP,
    MIN,
    PTS,
    REB,
    AST,
    STL,
    BLK,
    TOV,
    FG_PCT,
    FG3_PCT,
    FT_PCT,
  }),
)

const archive = {
  1996: {
    season: '1995-96',
    teamId: '1610612741',
    source: 'Verified season archive',
    archived: true,
    perMode: 'PerGame',
    roster,
    coaches: [{ COACH_NAME: 'Phil Jackson', IS_ASSISTANT: 0 }],
    players,
    unavailable: 0,
  },
}

export function archivedNbaSeason(endingYear, mode) {
  const season = archive[Number(endingYear)]
  if (!season) return null
  if (mode === 'roster') {
    return {
      season: season.season,
      teamId: season.teamId,
      source: season.source,
      archived: season.archived,
      roster: season.roster,
      coaches: season.coaches,
    }
  }
  if (mode === 'stats') {
    return {
      season: season.season,
      teamId: season.teamId,
      source: season.source,
      archived: season.archived,
      perMode: season.perMode,
      players: season.players,
      unavailable: season.unavailable,
    }
  }
  return null
}
