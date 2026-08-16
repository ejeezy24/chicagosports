// Verified, in-repository snapshots keep landmark seasons available when the
// NBA Stats host throttles or blocks serverless data centers. This is source
// data, not scraped at request time. The 1995-96 rows were cross-checked with:
// - Basketball Reference: basketball-reference.com/teams/CHI/1996.html
// - RealGM: basketball.realgm.com/nba/teams/Chicago-Bulls/4/Rosters/Regular/1996
// - WhatIfSports totals: whatifsports.com/nba-l/profile_team.asp?hfid=4&season=1995-96

const roster1996 = [
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

const players1996 = rows.map(
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

// Official NBA.com 2025-26 Bulls player totals, captured after all 82 games.
// Percentages are stored as decimals to match NBA Stats API responses.
const rows2026 = [
  ['Anfernee Simons', 'G', 6, 170, 91, 17, 18, 0, 2, 13, .438, .320, 1.000],
  ['Ayo Dosunmu', 'G', 45, 1187, 677, 136, 164, 34, 12, 61, .514, .451, .857],
  ['Coby White', 'G', 29, 843, 540, 108, 136, 20, 2, 88, .438, .346, .805],
  ['Collin Sexton', 'G', 26, 676, 454, 75, 66, 40, 3, 52, .482, .410, .822],
  ['Dalen Terry', 'F', 34, 377, 118, 64, 43, 22, 11, 21, .441, .413, .529],
  ['Emanuel Miller', 'F', 5, 33, 15, 3, 4, 2, 0, 0, .462, .333, .500],
  ['Guerschon Yabusele', 'F', 26, 641, 261, 147, 45, 20, 11, 26, .405, .383, .767],
  ['Isaac Okoro', 'F', 63, 1695, 584, 173, 100, 46, 29, 46, .460, .330, .795],
  ['Jaden Ivey', 'G', 4, 115, 46, 19, 16, 8, 2, 6, .417, .381, .889],
  ['Jalen Smith', 'C', 53, 1095, 541, 355, 65, 24, 42, 53, .483, .373, .742],
  ['Jevon Carter', 'G', 23, 254, 124, 26, 19, 13, 2, 11, .398, .410, 1.000],
  ['Josh Giddey', 'G', 54, 1731, 919, 448, 494, 55, 27, 196, .448, .364, .763],
  ['Julian Phillips', 'F', 35, 333, 99, 44, 7, 17, 6, 7, .420, .327, .818],
  ['Kevin Huerter', 'G', 44, 1037, 479, 169, 116, 35, 26, 49, .455, .314, .732],
  ['Lachlan Olbrich', 'C', 37, 344, 89, 112, 42, 12, 8, 16, .468, .105, .375],
  ['Leonard Miller', 'F', 27, 624, 317, 156, 35, 13, 15, 27, .555, .356, .762],
  ['Mac McClung', 'G', 8, 101, 48, 6, 9, 6, 2, 7, .390, .250, .786],
  ['Matas Buzelis', 'F', 77, 2248, 1252, 448, 158, 55, 116, 159, .463, .349, .786],
  ['Mouhamadou Gueye', 'F', 2, 45, 16, 6, 6, 2, 1, 3, .545, .200, .750],
  ['Nick Richards', 'C', 20, 447, 187, 152, 8, 6, 18, 34, .523, .278, .630],
  ['Nikola Vučević', 'C', 48, 1480, 810, 431, 181, 32, 31, 69, .505, .376, .838],
  ['Noa Essengue', 'F', 2, 6, 0, 0, 0, 1, 0, 0, .000, .000, .000],
  ['Patrick Williams', 'F', 72, 1474, 505, 215, 105, 49, 26, 75, .372, .347, .720],
  ['Rob Dillingham', 'G', 30, 644, 288, 90, 85, 28, 3, 64, .428, .300, .743],
  ['Tre Jones', 'G', 65, 1752, 914, 204, 350, 76, 11, 92, .553, .315, .841],
  ['Trentyn Flowers', 'F', 2, 6, 4, 1, 1, 0, 0, 1, .667, .000, .000],
  ['Yuki Kawamura', 'G', 18, 209, 62, 33, 47, 9, 0, 14, .327, .297, .895],
  ['Zach Collins', 'C', 10, 184, 97, 56, 15, 2, 4, 10, .578, .429, .700],
]

const players2026 = rows2026.map(
  ([PLAYER_NAME, POSITION, GP, MIN, PTS, REB, AST, STL, BLK, TOV, FG_PCT, FG3_PCT, FT_PCT]) => ({
    PLAYER_NAME, POSITION, PLAYER_ID: null, GP, MIN, PTS, REB, AST, STL, BLK, TOV, FG_PCT, FG3_PCT, FT_PCT,
  }),
)

const roster2026 = players2026.map((player) => ({
  PLAYER: player.PLAYER_NAME,
  PLAYER_ID: player.PLAYER_ID,
  POSITION: player.POSITION,
  NUM: null,
}))

const archive = {
  1996: {
    season: '1995-96',
    teamId: '1610612741',
    source: 'Verified season archive',
    archived: true,
    perMode: 'PerGame',
    roster: roster1996,
    coaches: [{ COACH_NAME: 'Phil Jackson', IS_ASSISTANT: 0 }],
    players: players1996,
    unavailable: 0,
  },
  2026: {
    season: '2025-26',
    teamId: '1610612741',
    source: 'Verified NBA.com season archive',
    archived: true,
    perMode: 'Totals',
    roster: roster2026,
    coaches: [],
    players: players2026,
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
