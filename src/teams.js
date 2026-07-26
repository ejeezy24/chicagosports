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

// Club colours are painted as text and rules against the page background. Most
// of the five read fine on paper as-is, but the logic can't assume that: prefer
// the club's primary, fall back to its secondary, and only then push the colour
// away from the backdrop until it clears the contrast floor.
export const BACKDROP = '#f4f1e8' // keep in step with --bg in index.css

// 3:1 is the WCAG AA floor for large / bold text, which is all this colour is
// used for. The margin above it absorbs the backdrop being tweaked later.
const MIN_CONTRAST = 3.5

function toRgb(hex) {
  const h = String(hex).replace('#', '')
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) || 0)
}

const toHex = (rgb) =>
  `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`

/** WCAG relative luminance, so "brighter" means brighter to an eye, not to sRGB. */
function luminance(rgb) {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** The club colour to use for anything that has to stay legible on the page. */
export function accentFor(team, backdrop = BACKDROP) {
  const bg = toRgb(backdrop)
  const primary = toRgb(team.color)
  const secondary = team.accent ? toRgb(team.accent) : null

  if (contrast(primary, bg) >= MIN_CONTRAST) return toHex(primary)
  if (secondary && contrast(secondary, bg) >= MIN_CONTRAST) return toHex(secondary)

  // Neither brand colour separates from the page. Step the primary away from
  // the backdrop — toward black on paper, toward white on a dark theme —
  // gradually, so the hue survives the correction.
  const target = luminance(bg) > 0.5 ? 0 : 255
  let rgb = primary
  for (let i = 0; i < 20 && contrast(rgb, bg) < MIN_CONTRAST; i++) {
    rgb = rgb.map((c) => c + (target - c) * 0.1)
  }
  return toHex(rgb)
}
