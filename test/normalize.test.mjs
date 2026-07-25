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
} from '../src/espn.js'
import { currentSeasonFor, seasonLabel, seasonOptions, clampSeason } from '../src/seasons.js'
import { TEAMS, teamByKey } from '../src/teams.js'

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

test('missing stats degrade to an empty list rather than throwing', () => {
  assert.deepEqual(statCategories(null), [])
  assert.deepEqual(statCategories({}), [])
  assert.deepEqual(statCategories({ results: {} }), [])
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
