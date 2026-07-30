// Smoke tests for the ESPN normalizers. The payloads below are trimmed to the
// fields the app reads, and deliberately mix the shape variations seen across
// leagues (object vs string scores, flat vs grouped rosters, stats nested under
// `results.stats` vs `splits`).
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  normalizeEvent,
  scheduleEvents,
  recordFromGames,
  rosterGroups,
  rosterSeason,
  rosterCoach,
  statCategories,
  standingsGroups,
  boxscore,
  periodLabels,
} from '../src/espn.js'
import { currentSeasonFor, seasonLabel, seasonOptions, clampSeason } from '../src/seasons.js'
import { BACKDROP, TEAMS, accentFor, teamByKey } from '../src/teams.js'
import { readdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { IMAGERY_CREDIT, VENUES, venueByName } from '../src/venues.js'

const cubs = teamByKey('cubs')
const bulls = teamByKey('bulls')

test('object-shaped scores with an explicit winner', () => {
  const g = normalizeEvent(
    {
      id: '1',
      date: '2016-10-22T20:08Z',
      competitions: [
        {
          venue: { fullName: 'Wrigley Field', address: { city: 'Chicago', state: 'IL' } },
          broadcasts: [{ names: ['FS1'] }],
          status: { type: { state: 'post', completed: true, shortDetail: 'Final' } },
          competitors: [
            {
              homeAway: 'home',
              winner: true,
              score: { value: 5, displayValue: '5' },
              team: { id: '16', displayName: 'Chicago Cubs', abbreviation: 'CHC' },
              records: [{ type: 'total', summary: '103-58' }],
            },
            {
              homeAway: 'away',
              winner: false,
              score: { value: 0, displayValue: '0' },
              team: { id: '19', shortDisplayName: 'Dodgers', abbreviation: 'LAD' },
            },
          ],
        },
      ],
    },
    '16',
  )

  assert.equal(g.result, 'W')
  assert.equal(g.home, true)
  assert.equal(g.ourScore, '5')
  assert.equal(g.theirScore, '0')
  assert.equal(g.opponent.name, 'Dodgers')
  assert.equal(g.venue, 'Wrigley Field')
  assert.equal(g.broadcast, 'FS1')
  assert.equal(g.record, '103-58')
  assert.equal(g.completed, true)
})

test('string-shaped scores with no winner flag fall back to comparison', () => {
  const g = normalizeEvent(
    {
      id: '2',
      date: '2023-09-10T17:00Z',
      week: { number: 1 },
      competitions: [
        {
          status: { type: { state: 'post', completed: true } },
          competitors: [
            { homeAway: 'away', score: '20', team: { id: '3', displayName: 'Chicago Bears' } },
            { homeAway: 'home', score: '38', team: { id: '12', displayName: 'Packers' } },
          ],
        },
      ],
    },
    '3',
  )

  assert.equal(g.result, 'L')
  assert.equal(g.home, false)
  assert.equal(g.week, 1)
})

test('upcoming games carry no result', () => {
  const g = normalizeEvent(
    {
      id: '3',
      date: '2026-08-01T00:00Z',
      competitions: [
        {
          status: { type: { state: 'pre', completed: false, shortDetail: '7:05 PM CT' } },
          competitors: [
            { homeAway: 'home', team: { id: '16' } },
            { homeAway: 'away', team: { id: '22' } },
          ],
        },
      ],
    },
    '16',
  )

  assert.equal(g.result, null)
  assert.equal(g.state, 'pre')
  assert.equal(g.ourScore, null)
  assert.equal(g.opponent.name, 'TBD')
})

test('events sort by date and roll up into a record', () => {
  const payload = {
    events: [
      {
        id: 'b',
        date: '2016-04-10T18:00Z',
        competitions: [
          {
            status: { type: { state: 'post', completed: true } },
            competitors: [
              { homeAway: 'home', score: '1', team: { id: '16' }, winner: false },
              { homeAway: 'away', score: '4', team: { id: '20' }, winner: true },
            ],
          },
        ],
      },
      {
        id: 'a',
        date: '2016-04-04T18:00Z',
        competitions: [
          {
            status: { type: { state: 'post', completed: true } },
            competitors: [
              { homeAway: 'home', score: '9', team: { id: '16' }, winner: true },
              { homeAway: 'away', score: '2', team: { id: '20' }, winner: false },
            ],
          },
        ],
      },
    ],
  }

  const games = scheduleEvents(payload, '16')
  assert.deepEqual(games.map((g) => g.id), ['a', 'b'])
  assert.equal(recordFromGames(games).text, '1-1')
  assert.equal(recordFromGames(games).played, 2)
})

test('ties are counted separately', () => {
  const rec = recordFromGames([{ result: 'W' }, { result: 'T' }, { result: 'L' }, { result: 'W' }])
  assert.equal(rec.text, '2-1-1')
})

test('grouped rosters keep their position headings', () => {
  const groups = rosterGroups({
    athletes: [
      {
        position: 'starting_pitcher',
        items: [
          {
            id: '1',
            fullName: 'Justin Steele',
            jersey: '35',
            position: { abbreviation: 'SP', displayName: 'Starting Pitcher' },
            displayHeight: '6\' 2"',
            displayWeight: '205 lbs',
            age: 30,
            bats: { abbreviation: 'L' },
            throws: { abbreviation: 'L' },
            college: { name: 'None' },
            birthPlace: { city: 'Hattiesburg', state: 'MS' },
          },
        ],
      },
      { position: 'catcher', items: [] },
    ],
  })

  assert.equal(groups.length, 1) // the empty group is dropped
  assert.equal(groups[0].label, 'Starting Pitcher')
  assert.equal(groups[0].athletes[0].name, 'Justin Steele')
  assert.equal(groups[0].athletes[0].bats, 'L')
  assert.equal(groups[0].athletes[0].birthplace, 'Hattiesburg, MS')
})

test('flat rosters still produce one group', () => {
  const groups = rosterGroups({
    athletes: [
      { id: '9', displayName: 'Coby White', jersey: '0', position: { abbreviation: 'PG' } },
      { id: '10', displayName: 'Matas Buzelis', jersey: '14' },
    ],
  })

  assert.equal(groups.length, 1)
  assert.equal(groups[0].label, 'Roster')
  assert.equal(groups[0].athletes.length, 2)
  assert.equal(groups[0].athletes[1].position, null)
})

test('roster metadata is read defensively', () => {
  assert.equal(rosterGroups({}).length, 0)
  assert.equal(rosterSeason({}), null)
  assert.deepEqual(rosterSeason({ season: { year: 2016, displayName: '2016 Season' } }), {
    year: 2016,
    label: '2016 Season',
  })
  assert.equal(rosterCoach({ coach: [{ firstName: 'Craig', lastName: 'Counsell' }] }), 'Craig Counsell')
  assert.equal(rosterCoach({}), null)
})

test('stats are found under results.stats', () => {
  const cats = statCategories({
    results: {
      stats: {
        categories: [
          {
            displayName: 'Batting',
            stats: [
              { displayName: 'Runs', displayValue: '819', perGameDisplayValue: '5.1', rank: 3 },
              { displayName: 'Empty', displayValue: null },
            ],
          },
        ],
      },
    },
  })

  assert.equal(cats.length, 1)
  assert.equal(cats[0].name, 'Batting')
  assert.equal(cats[0].stats.length, 1) // the null-valued stat is dropped
  assert.equal(cats[0].stats[0].value, '819')
  assert.equal(cats[0].stats[0].rank, '#3')
})

test('stats are also found under splits', () => {
  const cats = statCategories({
    splits: {
      categories: [
        { name: 'defensive', stats: [{ shortDisplayName: 'SACK', value: 41 }] },
      ],
    },
  })

  assert.equal(cats[0].name, 'defensive')
  assert.equal(cats[0].stats[0].value, 41)
})

test('stats repeating a display name still get distinct keys', () => {
  const cats = statCategories({
    splits: {
      categories: [
        {
          name: 'general',
          stats: [
            { name: 'fumblesTouchdowns', displayName: 'Fumbles Touchdowns', value: 0 },
            { name: 'offensiveFumblesTouchdowns', displayName: 'Fumbles Touchdowns', value: 0 },
            { name: 'defensiveFumblesTouchdowns', displayName: 'Fumbles Touchdowns', value: 0 },
            // no machine name to fall back on, and a name ESPN already used
            { displayName: 'Fumbles Touchdowns', value: 0 },
            { name: 'fumblesTouchdowns', displayName: 'Fumbles Touchdowns', value: 0 },
          ],
        },
      ],
    },
  })

  const keys = cats[0].stats.map((s) => s.key)
  assert.equal(keys.length, 5)
  assert.equal(new Set(keys).size, 5)
  assert.equal(cats[0].stats.every((s) => s.label === 'Fumbles Touchdowns'), true)
})

test('missing stats degrade to an empty list rather than throwing', () => {
  assert.deepEqual(statCategories(null), [])
  assert.deepEqual(statCategories({}), [])
  assert.deepEqual(statCategories({ results: {} }), [])
})

test('period labels follow each sport past regulation', () => {
  // Baseball just numbers innings, however many there are.
  assert.deepEqual(periodLabels('baseball', 10).slice(-2), ['9', '10'])
  assert.deepEqual(periodLabels('football', 5), ['1', '2', '3', '4', 'OT'])
  assert.deepEqual(periodLabels('basketball', 6).slice(-2), ['OT', '2OT'])
  // Hockey's second extra column is a shootout, not a second overtime.
  assert.deepEqual(periodLabels('hockey', 5), ['1', '2', '3', 'OT', 'SO'])
})

test('a baseball boxscore keeps runs, hits and errors', () => {
  const box = boxscore(
    {
      header: {
        competitions: [
          {
            competitors: [
              {
                homeAway: 'home',
                team: { id: '16', abbreviation: 'CHC', shortDisplayName: 'Cubs' },
                score: 2,
                hits: 6,
                errors: 1,
                winner: true,
                linescores: [{ displayValue: '0' }, { displayValue: '2' }],
              },
              {
                homeAway: 'away',
                team: { id: '30', abbreviation: 'TB', shortDisplayName: 'Rays' },
                score: 1,
                hits: 4,
                errors: 0,
                linescores: [{ displayValue: '1' }, { displayValue: '0' }],
              },
            ],
          },
        ],
      },
      boxscore: {
        teams: [
          {
            team: { id: '16' },
            statistics: [
              { name: 'batting', displayName: 'Batting', stats: [{ name: 'hits', displayName: 'Hits', displayValue: '6' }] },
              { name: 'records', displayName: 'Records', stats: [{ name: 'overall', displayName: 'Overall', displayValue: '59-46' }] },
            ],
          },
          {
            team: { id: '30' },
            statistics: [
              { name: 'batting', displayName: 'Batting', stats: [{ name: 'hits', displayName: 'Hits', displayValue: '4' }] },
              { name: 'records', displayName: 'Records', stats: [{ name: 'overall', displayName: 'Overall', displayValue: '61-43' }] },
            ],
          },
        ],
      },
      gameInfo: { venue: { fullName: 'Tropicana Field' }, attendance: 21377, gameDuration: '2:47' },
    },
    '16',
    'baseball',
  )

  assert.equal(box.hasHitsErrors, true)
  assert.deepEqual(box.periodLabels, ['1', '2'])

  // Away team is printed first, whichever side Chicago is on.
  assert.equal(box.rows[0].abbr, 'TB')
  assert.equal(box.rows[1].isUs, true)
  assert.equal(box.rows[1].hits, 6)
  assert.equal(box.rows[1].winner, true)

  // Stats are paired against the opponent, and the season record is not a
  // game stat so it does not belong in a boxscore.
  assert.deepEqual(box.statGroups.map((g) => g.name), ['Batting'])
  assert.deepEqual(box.statGroups[0].stats[0], {
    key: 'hits',
    label: 'Hits',
    us: '6',
    them: '4',
  })

  assert.equal(box.info.attendance, '21,377')
  assert.equal(box.info.duration, '2:47')
})

test('a flat-stat boxscore pairs up and skips hits/errors', () => {
  const box = boxscore(
    {
      header: {
        competitions: [
          {
            competitors: [
              {
                homeAway: 'away',
                team: { id: '3', abbreviation: 'CHI' },
                score: 26,
                linescores: [{ value: 3 }, { value: 17 }, { value: 3 }, { value: 3 }],
              },
              {
                homeAway: 'home',
                team: { id: '12', abbreviation: 'KC' },
                score: 20,
                linescores: [{ value: 7 }, { value: 3 }, { value: 3 }, { value: 7 }],
              },
            ],
          },
        ],
      },
      boxscore: {
        teams: [
          { team: { id: '3' }, statistics: [{ name: 'firstDowns', label: '1st Downs', displayValue: '16' }] },
          { team: { id: '12' }, statistics: [{ name: 'firstDowns', label: '1st Downs', displayValue: '21' }] },
        ],
      },
    },
    '3',
    'football',
  )

  assert.equal(box.hasHitsErrors, false)
  assert.deepEqual(box.periodLabels, ['1', '2', '3', '4'])
  assert.deepEqual(box.rows[0].scores, ['3', '17', '3', '3'])
  // Flat leagues get a single unnamed group.
  assert.deepEqual(box.statGroups.map((g) => g.name), ['Team stats'])
  assert.deepEqual(box.statGroups[0].stats[0].us, '16')
  assert.deepEqual(box.statGroups[0].stats[0].them, '21')
})

test('boxscores survive a thin or mismatched payload', () => {
  assert.equal(boxscore(null, '16', 'baseball'), null)
  assert.equal(boxscore({}, '16', 'baseball'), null)

  // Ragged line scores shouldn't produce holes: a team missing a period gets a
  // placeholder rather than undefined.
  const box = boxscore(
    {
      header: {
        competitions: [
          {
            competitors: [
              { homeAway: 'home', team: { id: '16' }, score: 1, linescores: [{ value: 1 }, { value: 0 }] },
              { homeAway: 'away', team: { id: '30' }, score: 0, linescores: [{ value: 0 }] },
            ],
          },
        ],
      },
    },
    '16',
    'baseball',
  )
  assert.equal(box.periodLabels.length, 2)
  assert.deepEqual(box.rows[0].scores, ['0', '—'])
  assert.deepEqual(box.statGroups, []) // no boxscore.teams at all
  assert.equal(box.info, null)
})

test('per-player lines line up with their column headings', () => {
  const box = boxscore(
    {
      header: {
        competitions: [
          { competitors: [{ homeAway: 'home', team: { id: '3' }, score: 21 }, { homeAway: 'away', team: { id: '8' }, score: 52 }] },
        ],
      },
      boxscore: {
        players: [
          {
            // Opponent listed first in the payload; the Chicago club should
            // still come out on top.
            team: { id: '8', displayName: 'Detroit Lions', abbreviation: 'DET' },
            statistics: [
              { name: 'passing', labels: ['YDS', 'TD'], athletes: [{ athlete: { id: '9', shortName: 'J. Goff' }, stats: ['312', '3'] }] },
            ],
          },
          {
            team: { id: '3', displayName: 'Chicago Bears', abbreviation: 'CHI' },
            statistics: [
              {
                name: 'kickReturns',
                labels: ['NO', 'YDS', 'TD'],
                totals: ['3', '70', '0'],
                athletes: [
                  // Short a value: the row still has to line up with three columns.
                  { athlete: { id: '1', shortName: 'D. Swift', position: { abbreviation: 'RB' } }, starter: true, stats: ['3', '70'] },
                  { starter: false, stats: ['1', '2', '0'] }, // no athlete at all
                ],
              },
              { name: 'skaters', labels: [], athletes: [] }, // empty group, as hockey sends
            ],
          },
        ],
      },
    },
    '3',
    'football',
  )

  assert.equal(box.playerTables.length, 2)
  assert.equal(box.playerTables[0].team.isUs, true, 'our club is listed first')
  assert.equal(box.playerTables[0].team.abbr, 'CHI')

  // The empty category is dropped; the camelCase name is made readable.
  assert.deepEqual(box.playerTables[0].categories.map((c) => c.name), ['Kick Returns'])

  const cat = box.playerTables[0].categories[0]
  assert.equal(cat.rows.length, 1, 'a row with no athlete is not a player')
  assert.deepEqual(cat.rows[0].stats, ['3', '70', '—'], 'short rows pad to the header')
  assert.equal(cat.rows[0].starter, true)
  assert.equal(cat.rows[0].position, 'RB')
  assert.deepEqual(cat.totals, ['3', '70', '0'])
})

test('boxscore stats repeating a machine name still get distinct keys', () => {
  // Football reports interceptions thrown and interceptions caught under the
  // same `name`, which React cannot key on.
  const box = boxscore(
    {
      header: {
        competitions: [
          { competitors: [{ homeAway: 'home', team: { id: '3' }, score: 21 }, { homeAway: 'away', team: { id: '8' }, score: 52 }] },
        ],
      },
      boxscore: {
        teams: [
          {
            team: { id: '3' },
            statistics: [
              { name: 'interceptions', label: 'Interceptions', displayValue: '1' },
              { name: 'interceptions', label: 'Interceptions thrown', displayValue: '2' },
            ],
          },
          {
            team: { id: '8' },
            statistics: [
              { name: 'interceptions', label: 'Interceptions', displayValue: '2' },
              { name: 'interceptions', label: 'Interceptions thrown', displayValue: '1' },
            ],
          },
        ],
      },
    },
    '3',
    'football',
  )

  const keys = box.statGroups[0].stats.map((s) => s.key)
  assert.equal(keys.length, 2)
  assert.equal(new Set(keys).size, 2, 'duplicate keys would drop a row')
})

test('mismatched stat order does not pair the wrong numbers together', () => {
  // If the opponent's stats arrive in a different order, an index-based pairing
  // would silently report another statistic's value as theirs.
  const box = boxscore(
    {
      header: {
        competitions: [
          { competitors: [{ homeAway: 'home', team: { id: '4' }, score: 3 }, { homeAway: 'away', team: { id: '9' }, score: 2 }] },
        ],
      },
      boxscore: {
        teams: [
          {
            team: { id: '4' },
            statistics: [
              { name: 'hits', label: 'Hits', displayValue: '26' },
              { name: 'takeaways', label: 'Takeaways', displayValue: '2' },
            ],
          },
          {
            team: { id: '9' },
            statistics: [
              { name: 'takeaways', label: 'Takeaways', displayValue: '9' },
              { name: 'hits', label: 'Hits', displayValue: '18' },
            ],
          },
        ],
      },
    },
    '4',
    'hockey',
  )

  const hits = box.statGroups[0].stats.find((s) => s.label === 'Hits')
  assert.equal(hits.us, '26')
  assert.equal(hits.them, null, 'better to show nothing than the wrong statistic')
})

test('standings flatten out of the conference/division tree', () => {
  const groups = standingsGroups({
    children: [
      {
        name: 'National League',
        children: [
          {
            name: 'NL Central',
            standings: {
              entries: [
                {
                  team: { id: '16', displayName: 'Chicago Cubs', abbreviation: 'CHC' },
                  stats: [
                    { name: 'wins', shortDisplayName: 'W', displayValue: '103' },
                    { name: 'losses', shortDisplayName: 'L', displayValue: '58' },
                    { name: 'unused', displayValue: undefined },
                  ],
                },
              ],
            },
          },
        ],
      },
    ],
  })

  assert.equal(groups.length, 1)
  assert.equal(groups[0].name, 'NL Central')
  assert.equal(groups[0].rows[0].team, 'Chicago Cubs')
  assert.equal(groups[0].rows[0].stats.length, 2)
})

test('empty standings produce no groups', () => {
  assert.deepEqual(standingsGroups({}), [])
  assert.deepEqual(standingsGroups({ children: [{ name: 'X', standings: { entries: [] } }] }), [])
})

test('season labelling follows each league convention', () => {
  assert.equal(seasonLabel(cubs, 2016), '2016')
  assert.equal(seasonLabel(bulls, 1996), '1995-96')
  assert.equal(seasonLabel(bulls, 2000), '1999-00')
})

test('current season respects each league calendar', () => {
  const july = new Date('2026-07-15T12:00:00Z')
  assert.equal(currentSeasonFor(teamByKey('cubs'), july), 2026)
  assert.equal(currentSeasonFor(teamByKey('bears'), july), 2026)
  assert.equal(currentSeasonFor(teamByKey('bulls'), july), 2026) // 2025-26 just ended

  const january = new Date('2026-01-15T12:00:00Z')
  assert.equal(currentSeasonFor(teamByKey('cubs'), january), 2025) // offseason
  assert.equal(currentSeasonFor(teamByKey('bears'), january), 2025) // playoffs of the 2025 season
  assert.equal(currentSeasonFor(teamByKey('blackhawks'), january), 2026) // 2025-26 in progress

  const october = new Date('2026-10-15T12:00:00Z')
  assert.equal(currentSeasonFor(teamByKey('bulls'), october), 2027) // 2026-27 under way
})

test('season lists are newest-first and honour the older-seasons toggle', () => {
  const now = new Date('2026-07-15T12:00:00Z')
  const modern = seasonOptions(cubs, { now })
  assert.equal(modern[0], 2026)
  assert.equal(modern.at(-1), cubs.modernFrom)

  const all = seasonOptions(cubs, { includeOlder: true, now })
  assert.equal(all.at(-1), cubs.oldestSeason)
  assert.ok(all.length > modern.length)
})

test('switching teams clamps a season that team never had', () => {
  const now = new Date('2026-07-15T12:00:00Z')
  assert.equal(clampSeason(bulls, 2016, now), 2016) // both leagues have 2016
  assert.equal(clampSeason(bulls, 1965, now), bulls.oldestSeason)
  assert.equal(clampSeason(cubs, 2030, now), 2026)
  assert.equal(clampSeason(cubs, NaN, now), 2026)
})

test('every team is configured with what the endpoints need', () => {
  assert.equal(TEAMS.length, 5)
  for (const t of TEAMS) {
    assert.ok(t.espnId && /^\d+$/.test(t.espnId), `${t.key} needs a numeric ESPN id`)
    assert.ok(['baseball', 'football', 'basketball', 'hockey'].includes(t.sport))
    assert.ok(t.seasonTypes.some((s) => s.id === 2), `${t.key} needs a regular season type`)
    assert.ok(t.modernFrom >= t.oldestSeason)
  }
  assert.equal(teamByKey('nope').key, 'cubs') // unknown keys fall back
})

test('every club plays somewhere the venue data knows about', () => {
  for (const t of TEAMS) {
    const venue = venueByName(t.venue)
    assert.ok(venue, `${t.key} venue "${t.venue}" has no entry in venues.js`)
    assert.ok(venue.teams.includes(t.key), `${venue.key} does not list ${t.key}`)
  }
  // Two clubs, one building.
  assert.equal(venueByName('United Center').teams.length, 2)
})

test('venue lookup handles former names and unknown grounds', () => {
  assert.equal(venueByName('Guaranteed Rate Field').key, 'rate')
  assert.equal(venueByName('U.S. Cellular Field').key, 'rate')
  assert.equal(venueByName('  wrigley field  ').key, 'wrigley') // trimmed, case-insensitive
  assert.equal(venueByName('Fenway Park'), null)
  assert.equal(venueByName(undefined), null)
})

test('every venue has the card copy the popover renders', () => {
  for (const v of VENUES) {
    assert.ok(v.facts.length > 0, `${v.key} should have some history`)
    assert.ok(v.blurb && v.opened && v.capacity, `${v.key} is missing card copy`)
    assert.ok(v.neighbourhood, `${v.key} is missing a neighbourhood`)
  }
})

test('every venue has a bundled aerial on disk', async () => {
  // Venue.jsx imports these by key. Node can't import a .jpg, so the check is
  // that the file each import points at exists and holds a real image — a
  // truncated or missing one would only surface as a broken <img> in the UI.
  const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'assets', 'venues')

  for (const v of VENUES) {
    const info = await stat(join(dir, `${v.key}.jpg`))
    assert.ok(info.size > 5000, `${v.key}.jpg looks empty or truncated`)
  }

  // No orphans: an aerial with no venue means a rename went half-done.
  const onDisk = (await readdir(dir)).filter((f) => f.endsWith('.jpg')).sort()
  assert.deepEqual(onDisk, VENUES.map((v) => `${v.key}.jpg`).sort())
})

test('imagery is credited', () => {
  assert.match(IMAGERY_CREDIT, /USGS/)
  assert.match(IMAGERY_CREDIT, /public domain/i)
})

test('every club accent stays legible on the page background', () => {
  const channel = (s) => (s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4)
  const luminance = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => channel(parseInt(hex.slice(i, i + 2), 16) / 255))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const ratio = (a, b) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
    return (hi + 0.05) / (lo + 0.05)
  }

  // Both the shipped paper backdrop and a hypothetical dark one, so the
  // correction is exercised in each direction.
  for (const backdrop of [BACKDROP, '#0b0b18']) {
    for (const t of TEAMS) {
      const accent = accentFor(t, backdrop)
      assert.match(accent, /^#[0-9a-f]{6}$/, `${t.key} accent should be a hex colour`)
      const c = ratio(accent, backdrop)
      // 3:1 is the WCAG AA floor for large / bold text, which is all this
      // colour is used for — headings, the masthead, and thin rules.
      assert.ok(
        c >= 3,
        `${t.key} accent ${accent} only reaches ${c.toFixed(2)}:1 on ${backdrop}`,
      )
    }
  }
})
