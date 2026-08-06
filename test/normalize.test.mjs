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
  scoreboardScores,
  withLiveScores,
} from '../src/espn.js'
import { currentSeasonFor, seasonLabel, seasonOptions, clampSeason } from '../src/seasons.js'
import { BACKDROP, TEAMS, accentFor, teamByKey } from '../src/teams.js'
import { readdir, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { IMAGERY_CREDIT, VENUES, venueByName } from '../src/venues.js'
import {
  espnPlayerStats,
  mlbPlayerStats,
  mlbRosterGroups,
  nbaPlayerStats,
  nbaRosterGroups,
  nflPlayerStats,
  nflRosterGroups,
  nhlPlayerStats,
  nhlRosterGroups,
  parseCsv,
} from '../src/players.js'
import { nbaSeasonKey, resultRows } from '../api/nba-history.js'
import { sportsReference } from '../src/references.js'
import { DEFAULT_TEAM, resolveState, toSearch } from '../src/urlState.js'
import { ownDivisionFirst } from '../src/espn.js'
import { coverageNote } from '../src/coverage.js'

const cubs = teamByKey('cubs')
const bulls = teamByKey('bulls')

test('archive coverage calls out unavailable and partial historical data', () => {
  const now = new Date('2026-08-02T12:00:00Z')
  assert.equal(coverageNote(bulls, 2026, now), null)
  assert.match(coverageNote(bulls, 1996, now).detail, /Roster: NBA Stats archive/)
  assert.match(coverageNote(bulls, 1996, now).detail, /Player stats: NBA Stats archive/)
  assert.match(coverageNote(teamByKey('bears'), 1999, now).detail, /Player stats: nflverse archive/)
  assert.match(coverageNote(teamByKey('bears'), 1985, now).detail, /unavailable before 1999/)
  assert.match(coverageNote(cubs, 2016, now).detail, /MLB archive/)
})

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

test('live scores are laid over a schedule that has none', () => {
  // ESPN's schedule payload omits the score entirely while a game is being
  // played — it carries only the probable pitchers — so an in-progress row has
  // nothing to show until the scoreboard fills it in.
  const scores = scoreboardScores({
    events: [
      {
        id: '99',
        competitions: [
          {
            status: { type: { state: 'in', shortDetail: 'Bot 7th' } },
            competitors: [
              { team: { id: '16' }, score: '1' },
              { team: { id: '10' }, score: '2' },
            ],
          },
        ],
      },
    ],
  })

  assert.equal(scores['99'].detail, 'Bot 7th')
  assert.deepEqual(scores['99'].byTeam, { 16: '1', 10: '2' })

  const games = [
    { id: '99', state: 'in', usId: '16', opponent: { id: '10' }, ourScore: null, theirScore: null, detail: 'Top 1st' },
    { id: '98', state: 'post', usId: '16', opponent: { id: '11' }, ourScore: '5', theirScore: '3', detail: 'Final' },
  ]

  const merged = withLiveScores(games, scores)
  assert.equal(merged[0].ourScore, '1')
  assert.equal(merged[0].theirScore, '2')
  assert.equal(merged[0].detail, 'Bot 7th')

  // A finished game already has the right score; don't touch it.
  assert.equal(merged[1], games[1])

  // Nothing to merge returns the very same array, so memoised consumers of it
  // don't rerun on every poll.
  assert.equal(withLiveScores(games, {}), games)
  assert.equal(withLiveScores(games, scoreboardScores(null)), games)
  assert.equal(withLiveScores(games, { 99: { byTeam: {} } }), games)
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

test('ESPN player stats survive the nulls ESPN actually sends', () => {
  // Football rosters come back with null entries inside the stats array; one of
  // them used to take the whole panel down.
  const groups = espnPlayerStats({
    positionGroups: [
      null,
      {
        athletes: [
          null,
          {
            id: '1',
            displayName: 'Caleb Williams',
            jersey: '18',
            position: { abbreviation: 'QB' },
            statistics: {
              splits: {
                categories: [
                  null,
                  {
                    displayName: 'Passing',
                    stats: [
                      null,
                      { name: 'passingYards', abbreviation: 'YDS', displayValue: '3,541' },
                      { name: 'passingTouchdowns', abbreviation: 'TD', displayValue: '20' },
                    ],
                  },
                  { displayName: 'Empty', stats: [] },
                ],
              },
            },
          },
          {
            id: '2',
            displayName: 'Rome Odunze',
            position: { abbreviation: 'WR' },
            statistics: {
              splits: {
                categories: [
                  {
                    displayName: 'Passing',
                    // Reports a stat the first player didn't, and misses one he did.
                    stats: [{ name: 'passingTouchdowns', abbreviation: 'TD', displayValue: '1' }],
                  },
                ],
              },
            },
          },
        ],
      },
    ],
  })

  assert.deepEqual(groups.map((g) => g.name), ['Passing'])
  assert.deepEqual(groups[0].columns, ['YDS', 'TD'])
  assert.equal(groups[0].rows.length, 2)
  assert.deepEqual(groups[0].rows[0].values, ['3,541', '20'])
  // The union of columns is filled per row, so a missing stat leaves a gap
  // rather than shifting later values into the wrong column.
  assert.deepEqual(groups[0].rows[1].values, ['—', '1'])
})

test('MLB player stats pick the split for the club being viewed', () => {
  const groups = mlbPlayerStats(
    {
      roster: [
        null,
        {
          person: {
            id: 1,
            fullName: 'Aaron Civale',
            stats: [
              {
                group: { displayName: 'pitching' },
                splits: [
                  // Combined line across both clubs, then one per club.
                  { numTeams: 2, stat: { wins: 5, gamesPlayed: 19 } },
                  { team: { id: 112 }, stat: { wins: 1, gamesPlayed: 3 } },
                  { team: { id: 133 }, stat: { wins: 4, gamesPlayed: 16 } },
                ],
              },
            ],
          },
          position: { abbreviation: 'P' },
          jerseyNumber: '38',
        },
      ],
    },
    '112',
  )

  const pitching = groups.find((g) => g.name === 'Pitching')
  const row = pitching.rows[0]
  assert.equal(row.name, 'Aaron Civale')
  assert.equal(row.jersey, '38')
  // Three games with the Cubs, not the nineteen he pitched in total.
  assert.equal(row.values[pitching.columns.indexOf('G')], '3')
  assert.equal(row.values[pitching.columns.indexOf('W')], '1')
  // Stats the payload doesn't carry show as a gap, not a zero.
  assert.equal(row.values[pitching.columns.indexOf('ERA')], '—')
})

test('an MLB roster becomes the same shape ESPN rosters do', () => {
  const groups = mlbRosterGroups(
    {
      roster: [
        null,
        {
          person: {
            id: 570489,
            fullName: 'Arismendy Alcántara',
            birthDate: '1991-10-29',
            height: "5' 10\"",
            weight: 170,
            birthCity: 'Santo Domingo',
            birthCountry: 'Dominican Republic',
            batSide: { code: 'S' },
            pitchHand: { code: 'R' },
          },
          jerseyNumber: '7',
          position: { abbreviation: '2B', name: 'Second Base', type: 'Infielder' },
        },
        {
          person: { id: 2, fullName: 'Jake Arrieta', birthDate: '1986-03-06' },
          jerseyNumber: '49',
          position: { abbreviation: 'P', name: 'Pitcher', type: 'Pitcher' },
        },
      ],
    },
    2015,
  )

  // Pitchers lead, the way a baseball roster is printed.
  assert.deepEqual(groups.map((g) => g.label), ['Pitchers', 'Infielders'])

  const player = groups[1].athletes[0]
  assert.equal(player.name, 'Arismendy Alcántara')
  assert.equal(player.jersey, '7')
  assert.equal(player.weight, '170 lbs')
  assert.equal(player.birthplace, 'Santo Domingo, Dominican Republic')
  assert.match(player.headshot, /570489/)

  // Age is as of the season being viewed, not today — StatsAPI only carries
  // the player's current age, which on a 2015 roster is a decade out.
  assert.equal(player.age, 23)
  assert.equal(groups[0].athletes[0].age, 29)
})

test('MLB roster age is right either side of a birthday', () => {
  const ageIn = (birthDate, season) =>
    mlbRosterGroups(
      { roster: [{ person: { id: 1, fullName: 'X', birthDate }, position: { type: 'Pitcher' } }] },
      season,
    )[0].athletes[0].age

  assert.equal(ageIn('1991-01-01', 2015), 24) // birthday already passed by mid-season
  assert.equal(ageIn('1991-12-31', 2015), 23) // still to come
  assert.equal(ageIn(null, 2015), null)
  assert.equal(ageIn('not a date', 2015), null)
})

test('an NHL roster becomes the same shape as the others', () => {
  const groups = nhlRosterGroups(
    {
      forwards: [
        null,
        {
          id: 1,
          firstName: { default: 'Bryan' },
          lastName: { default: 'Bickell' },
          sweaterNumber: 29,
          positionCode: 'L',
          shootsCatches: 'L',
          heightInInches: 76,
          weightInPounds: 223,
          birthDate: '1986-03-09',
          birthCity: { default: 'Bowmanville' },
          birthStateProvince: { default: 'ON' },
          birthCountry: 'CAN',
          headshot: 'https://example/1.png',
        },
      ],
      defensemen: [],
      goalies: [
        {
          id: 2,
          firstName: { default: 'Corey' },
          lastName: { default: 'Crawford' },
          positionCode: 'G',
          heightInInches: 74,
          birthDate: '1984-12-31',
        },
      ],
    },
    2015,
  )

  // The empty group is dropped; names come out of their localised wrappers.
  assert.deepEqual(groups.map((g) => g.label), ['Forwards', 'Goalies'])

  const p = groups[0].athletes[0]
  assert.equal(p.name, 'Bryan Bickell')
  assert.equal(p.jersey, 29)
  assert.equal(p.height, `6' 4"`, 'inches become feet and inches')
  assert.equal(p.weight, '223 lbs')
  assert.equal(p.age, 29, 'age during the season, not today')
  assert.equal(p.birthplace, 'Bowmanville, ON')
  assert.equal(p.throws, 'L')
  assert.equal(p.bats, null, 'hockey reports one hand, not two')

  // Missing height/weight leave gaps rather than nonsense.
  assert.equal(groups[1].athletes[0].weight, null)
})

test('NHL skaters and goalies become separate tables, formatted', () => {
  const tables = nhlPlayerStats({
    skaters: [
      {
        playerId: 1,
        firstName: { default: 'Marian' },
        lastName: { default: 'Hossa' },
        positionCode: 'R',
        gamesPlayed: 82,
        goals: 22,
        assists: 39,
        points: 61,
        shots: 247,
        shootingPctg: 0.0891,
        avgTimeOnIcePerGame: 1113,
        faceoffWinPctg: 0.5714,
      },
    ],
    goalies: [
      {
        playerId: 2,
        firstName: { default: 'Corey' },
        lastName: { default: 'Crawford' },
        gamesPlayed: 57,
        wins: 32,
        goalsAgainstAverage: 2.2712,
        savePercentage: 0.9236,
      },
    ],
  })

  assert.deepEqual(tables.map((t) => t.name), ['Skaters', 'Goalies'])

  const skater = tables[0]
  const at = (label) => skater.rows[0].values[skater.columns.indexOf(label)]
  assert.equal(skater.rows[0].name, 'Marian Hossa')
  assert.equal(at('P'), '61')
  // Rates and ice time are unreadable raw: 0.0891 and 1113 seconds.
  assert.equal(at('S%'), '8.9%')
  assert.equal(at('FO%'), '57.1%')
  assert.equal(at('TOI/G'), '18:33')

  const goalie = tables[1]
  const gAt = (label) => goalie.rows[0].values[goalie.columns.indexOf(label)]
  assert.equal(gAt('GAA'), '2.27')
  assert.equal(gAt('SV%'), '.924', 'save percentage is written without the leading zero')
  assert.equal(gAt('SO'), '—', 'a stat the payload omits is a gap, not a zero')

  // An empty side produces no table at all.
  assert.deepEqual(nhlPlayerStats({ skaters: [], goalies: [] }), [])
  assert.deepEqual(nhlPlayerStats(null), [])
})

test('CSV parsing survives commas inside quoted fields', () => {
  // nflverse headshot URLs contain commas — .../f_auto,q_auto/... — and a naive
  // split on commas shifts every column after them.
  const csv = [
    'season,team,full_name,headshot_url,college',
    '2015,CHI,Jared Allen,"https://x/f_auto,q_auto/img",Idaho State',
    '2015,GB,Someone Else,,Wisconsin',
  ].join('\n')

  const all = parseCsv(csv)
  assert.equal(all.length, 2)
  assert.equal(all[0].headshot_url, 'https://x/f_auto,q_auto/img')
  assert.equal(all[0].college, 'Idaho State', 'the column after a quoted field must not shift')

  // The predicate filters league-wide data down to one club.
  assert.deepEqual(parseCsv(csv, (r) => r.team === 'CHI').map((r) => r.full_name), ['Jared Allen'])

  // Escaped quotes, blank lines and a header-only file.
  assert.equal(parseCsv('a,b\n"say ""hi""",2').at(0).a, 'say "hi"')
  assert.deepEqual(parseCsv('a,b'), [])
  assert.deepEqual(parseCsv(''), [])
  assert.deepEqual(parseCsv(null), [])
})

test('an nflverse roster groups by unit and picks one club', () => {
  const csv = [
    'season,team,position,jersey_number,full_name,birth_date,height,weight,college,headshot_url,gsis_id,status',
    '2015,CHI,WR,17,Alshon Jeffery,1990-02-14,75,216,South Carolina,https://x/1.png,00-1,ACT',
    '2015,CHI,OLB,69,Jared Allen,1982-04-03,78,255,Idaho State,https://x/2.png,00-2,ACT',
    '2015,CHI,K,6,Robbie Gould,1982-12-06,72,185,Penn State,https://x/3.png,00-3,ACT',
    '2015,GB,QB,12,Aaron Rodgers,1983-12-02,74,225,California,https://x/4.png,00-4,ACT',
  ].join('\n')

  const groups = nflRosterGroups(csv, 'CHI', 2015)

  // Units in reading order, and Green Bay left out of it.
  assert.deepEqual(groups.map((g) => g.label), ['Offense', 'Defense', 'Special teams'])
  assert.equal(groups.reduce((n, g) => n + g.athletes.length, 0), 3)

  const jeffery = groups[0].athletes[0]
  assert.equal(jeffery.name, 'Alshon Jeffery')
  assert.equal(jeffery.height, `6' 3"`, 'inches become feet and inches')
  assert.equal(jeffery.weight, '216 lbs')
  assert.equal(jeffery.age, 25, 'his age in 2015, not now')
  assert.equal(jeffery.college, 'South Carolina')

  assert.equal(nflRosterGroups(csv, 'NYJ', 2015).length, 0, 'a club with no rows gets nothing')
})

test('nflverse season totals become football-specific stat tables', () => {
  const groups = nflPlayerStats({
    players: [
      {
        player_id: 'cutler',
        player_display_name: 'Jay Cutler',
        position: 'QB',
        games: '15',
        completions: '311',
        attempts: '483',
        passing_yards: '3659',
        passing_tds: '21',
        passing_interceptions: '11',
        carries: '38',
        rushing_yards: '201',
        rushing_tds: '1',
      },
      {
        player_id: 'jeffery',
        player_display_name: 'Alshon Jeffery',
        position: 'WR',
        games: '9',
        receptions: '54',
        targets: '94',
        receiving_yards: '807',
        receiving_tds: '4',
      },
      {
        player_id: 'mcphee',
        player_display_name: 'Pernell McPhee',
        position: 'OLB',
        games: '14',
        def_tackles_solo: '36',
        def_tackle_assists: '11',
        def_tackles_for_loss: '8',
        def_sacks: '6',
        def_interceptions: '1',
        def_pass_defended: '3',
        def_tds: '0',
      },
      {
        player_id: 'gould',
        player_display_name: 'Robbie Gould',
        position: 'K',
        games: '16',
        fg_made: '33',
        fg_att: '39',
        fg_pct: '0.846153846',
        pat_made: '28',
        pat_att: '29',
      },
    ],
  })

  assert.deepEqual(groups.map((group) => group.name), [
    'Passing',
    'Rushing',
    'Receiving',
    'Defense',
    'Kicking',
  ])
  assert.equal(groups[0].rows[0].name, 'Jay Cutler')
  assert.equal(groups[2].rows[0].values[groups[2].columns.indexOf('YDS')], '807')
  assert.equal(groups[3].rows[0].values[groups[3].columns.indexOf('SACK')], '6')
  assert.equal(groups[4].rows[0].values[groups[4].columns.indexOf('FG%')], '84.6%')
  assert.deepEqual(nflPlayerStats({ players: [] }, 'CHI'), [])
})

test('NBA result sets, roster rows and season totals are normalized', () => {
  assert.equal(nbaSeasonKey(1996), '1995-96')
  assert.equal(nbaSeasonKey('2000'), '1999-00')
  assert.equal(nbaSeasonKey('nope'), null)

  const payload = {
    resultSets: [
      {
        name: 'CommonTeamRoster',
        headers: ['PLAYER_ID', 'PLAYER', 'NUM', 'POSITION', 'HEIGHT', 'WEIGHT', 'AGE', 'SCHOOL'],
        rowSet: [
          [893, 'Michael Jordan', '23', 'G', '6-6', '216', 33, 'North Carolina'],
          [23, 'Scottie Pippen', '33', 'F', '6-8', '228', 30, 'Central Arkansas'],
          [29, 'Luc Longley', '13', 'C', '7-2', '265', 27, 'New Mexico'],
        ],
      },
    ],
  }
  const roster = resultRows(payload, 'CommonTeamRoster')
  assert.equal(roster[0].PLAYER, 'Michael Jordan')

  const rosterGroups = nbaRosterGroups({ roster })
  assert.deepEqual(rosterGroups.map((group) => group.label), ['Guards', 'Forwards', 'Centers'])
  assert.equal(rosterGroups[0].athletes[0].height, `6' 6"`)
  assert.equal(rosterGroups[0].athletes[0].age, 33)
  assert.match(rosterGroups[0].athletes[0].headshot, /893/)

  const stats = nbaPlayerStats({
    players: [
      {
        PLAYER_ID: 893,
        PLAYER_NAME: 'Michael Jordan',
        GP: 82,
        MIN: 3090,
        PTS: 2491,
        REB: 543,
        AST: 352,
        STL: 180,
        BLK: 42,
        TOV: 197,
        FG_PCT: 0.495,
        FG3_PCT: 0.427,
        FT_PCT: 0.834,
      },
    ],
  })[0]
  assert.equal(stats.rows[0].name, 'Michael Jordan')
  assert.equal(stats.rows[0].values[stats.columns.indexOf('PTS')], '2491')
  assert.equal(stats.rows[0].values[stats.columns.indexOf('3P%')], '.427')
  assert.deepEqual(nbaRosterGroups(null), [])
  assert.deepEqual(nbaPlayerStats(null), [])
})

test('Sports Reference is linked for cross-checking, not used as a data feed', () => {
  assert.equal(
    sportsReference(teamByKey('bulls'), 1996).url,
    'https://www.basketball-reference.com/teams/CHI/1996.html',
  )
  assert.equal(
    sportsReference(teamByKey('bears'), 1985).url,
    'https://www.pro-football-reference.com/teams/chi/1985.htm',
  )
})

test('player stats degrade to nothing rather than throwing', () => {
  assert.deepEqual(espnPlayerStats(null), [])
  assert.deepEqual(espnPlayerStats({}), [])
  assert.deepEqual(espnPlayerStats({ positionGroups: [] }), [])
  assert.deepEqual(mlbPlayerStats(null, '112'), [])
  assert.deepEqual(mlbPlayerStats({ roster: [] }, '112'), [])
})

const NOW = new Date('2026-08-02T12:00:00Z')

test('a deep link to an old season survives the options list', () => {
  // The hazard this exists to prevent: App snaps `season` back whenever it
  // isn't in the visible list, and that list starts at modernFrom (2003 for the
  // Bulls) unless the older-seasons box is ticked. Deriving the tick from the
  // season is what stops a link to 1995 being rewritten to the current year.
  const s = resolveState('?team=bulls&season=1995&tab=roster', null, NOW)
  assert.equal(s.teamKey, 'bulls')
  assert.equal(s.season, 1995)
  assert.equal(s.tab, 'roster')
  assert.equal(s.includeOlder, true, 'must be on, or the season gets snapped away')
  assert.ok(seasonOptions(teamByKey('bulls'), { includeOlder: s.includeOlder, now: NOW }).includes(1995))

  // An explicit older=0 must not win over a season that needs it.
  assert.equal(resolveState('?team=bulls&season=1995&older=0', null, NOW).includeOlder, true)

  // A modern season leaves the box alone.
  assert.equal(resolveState('?team=bulls&season=2020', null, NOW).includeOlder, false)
})

test('url state falls back per key, and garbage never throws', () => {
  // Nothing at all: stored team, current season, first tab.
  const bare = resolveState('', 'bears', NOW)
  assert.equal(bare.teamKey, 'bears')
  assert.equal(bare.season, currentSeasonFor(teamByKey('bears'), NOW))
  assert.equal(bare.tab, 'schedule')

  // A partial link resolves the rest rather than giving up.
  assert.equal(resolveState('?tab=roster', 'bears', NOW).teamKey, 'bears')

  // Each bad key falls back on its own.
  const junk = resolveState('?team=zzz&season=abc&tab=nope', 'whitesox', NOW)
  assert.equal(junk.teamKey, 'whitesox')
  assert.equal(junk.season, currentSeasonFor(teamByKey('whitesox'), NOW))
  assert.equal(junk.tab, 'schedule')

  // An unusable stored key falls through to the default rather than crashing.
  assert.equal(resolveState('', 'not-a-team', NOW).teamKey, DEFAULT_TEAM)
  assert.equal(resolveState('', null, NOW).teamKey, DEFAULT_TEAM)

  // A two-digit year would otherwise clamp to the club's oldest season, which
  // reads as a deliberate choice rather than a typo.
  assert.equal(resolveState('?team=cubs&season=2', null, NOW).season, currentSeasonFor(cubs, NOW))
  // A real but out-of-range year clamps instead of being discarded.
  assert.equal(resolveState('?team=cubs&season=1912', null, NOW).season, cubs.oldestSeason)
})

test('the query string round-trips and keeps params it does not own', () => {
  const state = resolveState('?team=blackhawks&season=1995&tab=players', null, NOW)
  const search = toSearch(state)

  // Fixed key order, so a string compare is a valid "did it change?" test.
  assert.equal(search, '?team=blackhawks&season=1995&tab=players&older=1')
  assert.deepEqual(resolveState(search, null, NOW), state)

  // older is only emitted when true.
  assert.ok(!toSearch(resolveState('?team=cubs&season=2020', null, NOW)).includes('older'))

  // Someone else's parameters survive being shared.
  const kept = toSearch(state, '?utm_source=x&team=stale')
  assert.ok(kept.includes('utm_source=x'), 'unknown params should be preserved')
  assert.equal((kept.match(/team=/g) ?? []).length, 1, 'and ours should not be duplicated')
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

test("the club's own division leads the standings", () => {
  const groups = [
    { name: 'AL East', rows: [{ id: '10' }] },
    { name: 'AL Central', rows: [{ id: '4' }, { id: '5' }] },
    { name: 'NL Central', rows: [{ id: '16' }] },
  ]

  // The rest keep ESPN's order behind it.
  assert.deepEqual(ownDivisionFirst(groups, '16').map((g) => g.name), [
    'NL Central',
    'AL East',
    'AL Central',
  ])
  assert.deepEqual(ownDivisionFirst(groups, '4').map((g) => g.name), [
    'AL Central',
    'AL East',
    'NL Central',
  ])

  // Already first, or not found at all: leave well alone.
  assert.deepEqual(ownDivisionFirst(groups, '10'), groups)
  assert.deepEqual(ownDivisionFirst(groups, '999'), groups)
  assert.deepEqual(ownDivisionFirst([], '16'), [])
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
