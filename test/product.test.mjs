import assert from 'node:assert/strict'
import test from 'node:test'
import { cityScoreboardRows, mergeScoreboardRows, scoreboardDateKey, scoreboardCache } from '../src/today.js'
import { calendarEvent, groupedMonths, initialOpenMonths, reconcileOpenMonths } from '../src/scheduleTools.js'
import { canonicalState } from '../src/meta.js'
import { upstreamUrl } from '../api/upstream.js'
import { teamByKey } from '../src/teams.js'
import { normalizeEvent } from '../src/espn.js'
import { formatTime } from '../src/format.js'

const teams = [
  { key: 'cubs', short: 'Cubs', name: 'Chicago Cubs', espnId: '16', sport: 'baseball', league: 'mlb' },
  { key: 'bears', short: 'Bears', name: 'Chicago Bears', espnId: '3', sport: 'football', league: 'nfl' },
]

function event({ id, date, usId, opponentId, state = 'pre', detail = '1:20 PM', ourScore, theirScore }) {
  return {
    id,
    date,
    competitions: [{
      status: { type: { state, completed: state === 'post', shortDetail: detail } },
      competitors: [
        { homeAway: 'home', score: ourScore, team: { id: usId, shortDisplayName: usId === '16' ? 'Cubs' : 'Bears' } },
        { homeAway: 'away', score: theirScore, team: { id: opponentId, shortDisplayName: 'Opponent', abbreviation: 'OPP' } },
      ],
    }],
  }
}

test('scoreboard date keys use Chicago calendar days', () => {
  assert.equal(scoreboardDateKey(new Date('2026-08-16T04:30:00Z'), 0), '20260815')
  assert.equal(scoreboardDateKey(new Date('2026-08-16T04:30:00Z'), 1), '20260816')
  assert.equal(scoreboardDateKey(new Date('2026-08-16T04:30:00Z'), -1), '20260814')
})

test('city scoreboard keeps only Chicago games and prioritizes live action', () => {
  const payloads = {
    cubs: { events: [
      event({ id: 'c', date: '2026-08-15T18:20:00Z', usId: '16', opponentId: '24' }),
      event({ id: 'other', date: '2026-08-15T19:00:00Z', usId: '99', opponentId: '98' }),
    ] },
    bears: { events: [event({ id: 'b', date: '2026-08-15T17:00:00Z', usId: '3', opponentId: '5', state: 'in', detail: 'Q3', ourScore: '17', theirScore: '14' })] },
  }
  const rows = cityScoreboardRows(payloads, teams)
  assert.deepEqual(rows.map((row) => row.teamKey), ['bears', 'cubs'])
  assert.equal(rows[0].status, 'LIVE · Q3')
  assert.equal(rows[0].score, '17–14')
  assert.equal(rows[1].status, '1:20 PM')
})

test('scoreboard cache validates and expires saved rows', () => {
  const memory = new Map()
  const storage = { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) }
  scoreboardCache.write(storage, '20260815', [{ teamKey: 'cubs' }], 1000)
  assert.deepEqual(scoreboardCache.read(storage, '20260815', 2000)?.rows, [{ teamKey: 'cubs' }])
  assert.equal(scoreboardCache.read(storage, '20260815', 1000 + 31 * 60_000), null)
  memory.set('cs.scoreboard.20260815', '{bad json')
  assert.equal(scoreboardCache.read(storage, '20260815', 2000), null)
})

test('partial scoreboard refreshes preserve cached teams that failed', () => {
  const cached = [
    { teamKey: 'cubs', eventId: 'old-cubs', date: '2026-08-15T18:00:00Z' },
    { teamKey: 'bears', eventId: 'old-bears', date: '2026-08-15T17:00:00Z' },
  ]
  const fresh = [{ teamKey: 'cubs', eventId: 'new-cubs', date: '2026-08-15T19:00:00Z' }]
  assert.deepEqual(mergeScoreboardRows(cached, fresh, ['cubs']).map((row) => row.eventId), ['old-bears', 'new-cubs'])
})

test('calendar export creates a valid Chicago game event', () => {
  const ics = calendarEvent({
    id: 'game-1', date: '2026-08-15T18:20:00Z', home: true,
    opponent: { name: 'Cardinals' }, venue: 'Wrigley Field', broadcast: 'Marquee',
  }, teams[0])
  assert.match(ics, /BEGIN:VCALENDAR/)
  assert.match(ics, /DTSTART:20260815T182000Z/)
  assert.match(ics, /SUMMARY:Chicago Cubs vs Cardinals/)
  assert.match(ics, /LOCATION:Wrigley Field/)
  assert.match(ics, /END:VCALENDAR/)
  assert.match(calendarEvent({ date: '2026-08-16T00:00:00Z', home: true, opponent: { name: 'Cardinals' } }, teams[0]), /DTSTART:20260816T000000Z/)
  assert.equal(formatTime('2026-08-16T00:00:00Z'), '7:00 PM')
  assert.equal(calendarEvent({ date: '2026-08-16T00:00:00Z', timeTbd: true, opponent: {} }, teams[0]), null)
  const tbd = normalizeEvent(event({ id: 'tbd', date: '2026-08-16T00:00:00Z', usId: '16', opponentId: '24', detail: 'TBD' }), '16')
  assert.equal(tbd.timeTbd, true)
})

test('schedule months group together and open only the relevant month initially', () => {
  const games = [
    { id: '1', date: '2026-07-01T18:00:00Z' },
    { id: '2', date: '2026-08-01T18:00:00Z' },
    { id: '3', date: '2026-08-02T18:00:00Z' },
  ]
  const groups = groupedMonths(games)
  assert.deepEqual(groups.map((group) => [group.label, group.games.length]), [['July 2026', 1], ['August 2026', 2]])
  assert.deepEqual([...initialOpenMonths(groups, new Date('2026-08-15T12:00:00Z'))], ['August 2026'])
  assert.deepEqual([...initialOpenMonths(groups, new Date('2027-01-01T12:00:00Z'), true)], ['July 2026'])
  assert.deepEqual([...reconcileOpenMonths(new Set(['July 2026']), groups)], ['July 2026'])
  assert.deepEqual([...reconcileOpenMonths(new Set(['Missing month']), groups)], ['August 2026'])
})

test('archive metadata includes the selected shareable view', () => {
  const meta = canonicalState({ team: teams[0], season: 2016, tab: 'archive', archiveView: 'history', includeOlder: false }, 'https://chicagosports.vercel.app')
  assert.equal(meta.url, 'https://chicagosports.vercel.app/?team=cubs&season=2016&tab=archive&view=history')
  assert.match(meta.title, /Timeline/)
  assert.match(meta.description, /Chicago Cubs/i)
  assert.match(canonicalState({ team: teamByKey('bulls'), season: 2026, tab: 'schedule' }, 'https://chicagosports.vercel.app').title, /^2025-26 Chicago Bulls/)
})

test('production upstream proxy is allowlisted and preserves safe queries', () => {
  assert.equal(
    upstreamUrl('site', 'apis/site/v2/sports/baseball/mlb/scoreboard', new URLSearchParams({ dates: '20260816' })),
    'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?dates=20260816',
  )
  assert.equal(upstreamUrl('evil', 'anything', new URLSearchParams()), null)
  assert.equal(upstreamUrl('site', 'https://evil.example/x', new URLSearchParams()), null)
  assert.equal(upstreamUrl('site', '../secrets', new URLSearchParams()), null)
})
