import test from 'node:test'
import assert from 'node:assert/strict'
import { cityScoreboardRows } from '../src/today.js'
import { previewDetails, scoreboardDestination } from '../src/gameDay.js'

test('scoreboard destinations use event seasons and safely recover legacy cached rows', () => {
  const now = new Date('2026-09-05T17:00:00Z')
  const linked = scoreboardDestination({ teamKey: 'cubs', eventId: 'g1', eventSeason: 2026, seasonType: 3 }, now)
  assert.equal(linked.season, 2026)
  assert.equal(linked.seasonType, 3)
  assert.equal(linked.gameId, 'g1')
  assert.equal(linked.tab, 'schedule')
  assert.equal(scoreboardDestination({ teamKey: 'bulls', eventId: 'old', date: '2025-10-22T00:00:00Z' }, now).season, 2026)
  assert.equal(scoreboardDestination({ teamKey: 'bears', eventId: 'playoff', date: '2026-01-12T01:00:00Z' }, now).season, 2025)
  assert.equal(scoreboardDestination({ teamKey: 'cubs', eventId: '<bad>', eventSeason: 'wrong', seasonType: 99 }, now).gameId, null)
  assert.equal(scoreboardDestination({ teamKey: 'missing' }, now), null)
  assert.equal(scoreboardDestination(null, now), null)
})

test('previews suppress unsafe calendar actions and preserve meaningful status', () => {
  const now = new Date('2026-09-05T17:00:00Z')
  const base = { date: '2026-10-06T18:20:00Z', opponent: { name: 'Cardinals' } }
  assert.equal(previewDetails({ ...base, detail: 'Postponed' }, { name: 'Cubs' }, now).canCalendar, false)
  assert.equal(previewDetails({ ...base, detail: 'Postponed' }, { name: 'Cubs' }, now).status, 'Postponed')
  assert.equal(previewDetails({ ...base, detail: '10/6 - 2:20 PM EDT' }, { name: 'Cubs' }, now).status, '')
  assert.equal(previewDetails({ ...base, date: null }, { name: 'Cubs' }, now).dateTime, 'TBD')
  assert.equal(previewDetails({ ...base, date: 'invalid' }, { name: 'Cubs' }, now).canCalendar, false)
  assert.equal(previewDetails({ ...base, date: '2026-08-01T18:20:00Z' }, { name: 'Cubs' }, now).canCalendar, false)
})

const team = { key: 'bulls', short: 'Bulls', espnId: '6' }

test('city scoreboard carries exact event season and season type', () => {
  const rows = cityScoreboardRows({ bulls: { events: [{ id: 'g1', date: '2025-10-22T00:00:00Z', season: { year: 2026, type: { id: '2' } }, competitions: [{ competitors: [{ homeAway: 'home', team: { id: '6', shortDisplayName: 'Bulls' } }, { homeAway: 'away', team: { id: '7', shortDisplayName: 'Celtics' } }], status: { type: { state: 'pre', detail: 'Wed, Oct 22 at 7:00 PM CT' } } }] }] } }, [team])
  assert.deepEqual(rows[0].eventSeason, 2026)
  assert.equal(rows[0].seasonType, 2)
  assert.equal(rows[0].eventId, 'g1')
})

test('upcoming preview has matchup, Chicago time, venue and broadcast without boxscore', () => {
  const details = previewDetails({ date: '2026-01-02T01:00:00Z', home: true, opponent: { name: 'Rangers' }, venue: 'United Center', venueCity: 'Chicago, IL', broadcast: 'ESPN', timeTbd: false }, { name: 'Blackhawks' }, new Date('2025-12-01T00:00:00Z'))
  assert.match(details.matchup, /Blackhawks vs Rangers/)
  assert.match(details.dateTime, /Jan 1/)
  assert.equal(details.venue, 'United Center · Chicago, IL')
  assert.equal(details.broadcast, 'ESPN')
  assert.equal(details.canCalendar, true)
})

test('TBD upcoming preview is not calendar eligible', () => {
  const details = previewDetails({ date: '2026-01-02T01:00:00Z', home: false, opponent: { name: 'Rangers' }, timeTbd: true }, { name: 'Blackhawks' }, new Date('2025-12-01T00:00:00Z'))
  assert.equal(details.dateTime, 'TBD')
  assert.equal(details.canCalendar, false)
})


test('scoreboard event navigation falls back to top-level season metadata', () => {
  const rows = cityScoreboardRows({ bulls: { season: { year: 2026, type: 3 }, events: [{
    id: 'season-fallback', date: '2026-04-22T00:00:00Z', competitions: [{ competitors: [
      { homeAway: 'home', team: { id: '6', shortDisplayName: 'Bulls' } },
      { homeAway: 'away', team: { id: '7', shortDisplayName: 'Celtics' } },
    ] }],
  }] } }, [team])
  assert.equal(rows[0].eventSeason, 2026)
  assert.equal(rows[0].seasonType, 3)
})
