// The five Chicago pro franchises, with everything the ESPN endpoints need.
//
// `espnId` is ESPN's numeric team id (stable across seasons, unlike the
// abbreviation). `sport`/`league` form the path segment: /sports/{sport}/{league}.
//
// Season labelling differs by league:
//   'single' — MLB and NFL seasons live inside one calendar year (2024).
//   'split'  — NBA and NHL seasons straddle two, and ESPN keys them by the
//              *ending* year, so id 2024 is the 2023-24 season.
export const TEAMS = [
  {
    key: 'cubs',
    name: 'Chicago Cubs',
    short: 'Cubs',
    abbr: 'CHC',
    league: 'mlb',
    leagueLabel: 'MLB',
    sport: 'baseball',
    espnId: '16',
    venue: 'Wrigley Field',
    color: '#0E3386',
    accent: '#CC3433',
    seasonStyle: 'single',
    modernFrom: 2002,
    oldestSeason: 1970,
    seasonTypes: [
      { id: 1, label: 'Spring' },
      { id: 2, label: 'Regular' },
      { id: 3, label: 'Postseason' },
    ],
  },
  {
    key: 'whitesox',
    name: 'Chicago White Sox',
    short: 'White Sox',
    abbr: 'CHW',
    league: 'mlb',
    leagueLabel: 'MLB',
    sport: 'baseball',
    espnId: '4',
    venue: 'Rate Field',
    color: '#27251F',
    accent: '#C4CED4',
    seasonStyle: 'single',
    modernFrom: 2002,
    oldestSeason: 1970,
    seasonTypes: [
      { id: 1, label: 'Spring' },
      { id: 2, label: 'Regular' },
      { id: 3, label: 'Postseason' },
    ],
  },
  {
    key: 'bears',
    name: 'Chicago Bears',
    short: 'Bears',
    abbr: 'CHI',
    league: 'nfl',
    leagueLabel: 'NFL',
    sport: 'football',
    espnId: '3',
    venue: 'Soldier Field',
    color: '#0B162A',
    accent: '#C83803',
    seasonStyle: 'single',
    modernFrom: 2002,
    oldestSeason: 1970,
    seasonTypes: [
      { id: 1, label: 'Preseason' },
      { id: 2, label: 'Regular' },
      { id: 3, label: 'Postseason' },
    ],
  },
  {
    key: 'bulls',
    name: 'Chicago Bulls',
    short: 'Bulls',
    abbr: 'CHI',
    league: 'nba',
    leagueLabel: 'NBA',
    sport: 'basketball',
    espnId: '4',
    venue: 'United Center',
    color: '#CE1141',
    accent: '#000000',
    seasonStyle: 'split',
    modernFrom: 2003,
    oldestSeason: 1971,
    seasonTypes: [
      { id: 1, label: 'Preseason' },
      { id: 2, label: 'Regular' },
      { id: 3, label: 'Postseason' },
    ],
  },
  {
    key: 'blackhawks',
    name: 'Chicago Blackhawks',
    short: 'Blackhawks',
    abbr: 'CHI',
    league: 'nhl',
    leagueLabel: 'NHL',
    sport: 'hockey',
    espnId: '4',
    venue: 'United Center',
    color: '#CF0A2C',
    accent: '#000000',
    seasonStyle: 'split',
    modernFrom: 2004,
    oldestSeason: 1971,
    seasonTypes: [
      { id: 1, label: 'Preseason' },
      { id: 2, label: 'Regular' },
      { id: 3, label: 'Postseason' },
    ],
  },
]

export const teamByKey = (key) => TEAMS.find((t) => t.key === key) ?? TEAMS[0]
