// The four buildings the five clubs play in.
//
// Unlike everything else in the app this content is editorial, not fetched —
// ESPN's endpoints carry a venue name and not much else. `aka` exists so a
// schedule from an older season, when the park went by a different name, still
// resolves to the right building.
//
// Each venue's aerial lives at `src/assets/venues/{key}.jpg` and is imported by
// components/Venue.jsx rather than here: bundlers resolve an image import to a
// URL, but plain Node can't load one, and this module stays importable by the
// tests. They are USGS national imagery — a work of the US federal government,
// so public domain — and are bundled at build time rather than fetched at
// runtime, which keeps ESPN the app's only network dependency.

export const IMAGERY_CREDIT = 'Aerial imagery: USGS · public domain'

export const VENUES = [
  {
    key: 'wrigley',
    name: 'Wrigley Field',
    aka: ['Weeghman Park', 'Cubs Park'],
    teams: ['cubs'],
    opened: 1914,
    capacity: '~41,600',
    neighbourhood: 'Lakeview',
    blurb: 'Second-oldest park in the major leagues, after Fenway.',
    facts: [
      'Built in 1914 as Weeghman Park for the Federal League Chicago Whales. The Cubs moved in two years later, and the name Wrigley Field arrived in 1927.',
      'The outfield ivy and the hand-turned centre-field scoreboard both date to Bill Veeck’s 1937 renovation. Nobody has ever hit the scoreboard.',
      'It held out against lights until 8 August 1988 — the last major league park to install them.',
      'The Bears played here too, from 1921 until 1970, before moving to Soldier Field.',
    ],
  },
  {
    key: 'rate',
    name: 'Rate Field',
    aka: ['Guaranteed Rate Field', 'U.S. Cellular Field', 'Comiskey Park'],
    teams: ['whitesox'],
    opened: 1991,
    capacity: '~40,300',
    neighbourhood: 'Armour Square',
    blurb: 'The last park built before Camden Yards started the retro wave.',
    facts: [
      'Opened in 1991 across 35th Street from the original Comiskey Park, which had stood since 1910.',
      'Camden Yards opened a year later and changed what a ballpark was supposed to look like, leaving this one the end of the modern multi-tier line.',
      'It kept Bill Veeck’s exploding scoreboard, a 1960 invention carried over from the old park, which still fires after every home run.',
      'The upper deck was famously steep; the top eight rows came off in a 2000s renovation, along with a new roof.',
    ],
  },
  {
    key: 'soldier',
    name: 'Soldier Field',
    aka: ['Municipal Grant Park Stadium'],
    teams: ['bears'],
    opened: 1924,
    capacity: '~61,500',
    neighbourhood: 'Near South Side',
    blurb: 'Smallest capacity in the NFL, and the only one with colonnades.',
    facts: [
      'Dedicated in 1925 as a memorial to American war dead. The Doric colonnades along each side are the original 1924 structure.',
      'The Bears only moved in for the 1971 season, after half a century at Wrigley Field.',
      'A modern seating bowl was dropped inside the old colonnades in 2002-03. The stadium lost its National Historic Landmark status in 2006 as a result.',
      'At roughly 61,500 seats it is the smallest stadium in the NFL.',
    ],
  },
  {
    key: 'united',
    name: 'United Center',
    aka: ['Chicago Stadium'],
    teams: ['bulls', 'blackhawks'],
    opened: 1994,
    capacity: '~20,900 hoops · ~19,700 hockey',
    neighbourhood: 'Near West Side',
    blurb: 'The one building in the city shared by two major-league clubs.',
    facts: [
      'Opened in 1994 to replace Chicago Stadium, which had stood across the street since 1929 and was demolished the following year.',
      'The floor swaps between hardwood and ice — the Bulls and the Blackhawks have shared it since day one.',
      'Michael Jordan’s statue, The Spirit, stands at the atrium. It arrived the same year the building did.',
      'Six championship banners went up in the first four seasons it was open.',
    ],
  },
]

const normalize = (s) => String(s ?? '').trim().toLowerCase()

const BY_NAME = new Map()
for (const v of VENUES) {
  for (const name of [v.name, ...(v.aka ?? [])]) BY_NAME.set(normalize(name), v)
}

/** Resolve a venue by the name ESPN reports (or an older name for it). */
export function venueByName(name) {
  return BY_NAME.get(normalize(name)) ?? null
}

export const venueByKey = (key) => VENUES.find((v) => v.key === key) ?? null
