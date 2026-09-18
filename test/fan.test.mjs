import test from 'node:test'
import assert from 'node:assert/strict'
import { dayKey, shiftDay, dateRange, filterGames, seasonSummary, normalizeFanData, challengeStats, gameKey } from '../src/fan.js'
import { buildCalendar, calendarGames, foldLine } from '../src/calendar.js'
import { QUESTIONS, dailyQuestion } from '../src/arcade.js'
import { TEAMS } from '../src/teams.js'
import { resolveState } from '../src/urlState.js'

const cubs = TEAMS[0]
const game = (overrides = {}) => ({ id: '1', date: '2026-09-19T00:10:00Z', opponent: { id: '4', name: 'White Sox' }, home: true, completed: true, state: 'post', ourScore: '5', theirScore: '2', result: 'W', venue: 'Wrigley Field', ...overrides })

test('Chicago day boundaries and DST use calendar dates, not the device timezone', () => {
  assert.equal(dayKey('2026-09-19T00:10:00Z'), '2026-09-18')
  assert.equal(dayKey('2026-01-01T05:59:00Z'), '2025-12-31')
  assert.equal(dayKey('2026-03-08T08:01:00Z'), '2026-03-08')
  assert.equal(dayKey('invalid'), '')
  assert.equal(shiftDay('2026-03-08', 1), '2026-03-09')
})

test('weekend means Friday–Sunday, including the current weekend', () => {
  assert.deepEqual(dateRange('weekend', '2026-09-17'), ['2026-09-18', '2026-09-20'])
  assert.deepEqual(dateRange('weekend', '2026-09-19'), ['2026-09-18', '2026-09-20'])
  assert.deepEqual(dateRange('weekend', '2026-09-20'), ['2026-09-18', '2026-09-20'])
  assert.deepEqual(dateRange('tomorrow', '2026-12-31'), ['2027-01-01', '2027-01-01'])
})

test('schedule filters combine opponent, location, Chicago weekday and status', () => {
  const saturday = game({ id: '2', date: '2026-09-20T00:10:00Z', completed: false, state: 'pre' })
  const games = [game(), saturday, game({ id: '3', date: saturday.date, home: false }), game({ id: '4', date: saturday.date, neutral: true })]
  assert.deepEqual(filterGames(games, { opponent: '4', location: 'home', day: '6', status: 'upcoming' }).map((g) => g.id), ['2'])
  assert.equal(filterGames(games, { day: 'weekend' }).length, 3)
  assert.equal(filterGames(games, { location: 'neutral' }).length, 1)
  assert.equal(filterGames(games, { opponent: 'unknown' }).length, 0)
  assert.equal(filterGames([game({ state: 'pre', completed: false, detail: 'Postponed' })], { status: 'upcoming' }).length, 0)
})

test('record and scoring totals ignore missing scores and unfinished games', () => {
  const summary = seasonSummary([game(), game({ id: '2', result: 'L', ourScore: '0', theirScore: '3' }), game({ id: '3', ourScore: null }), game({ id: '4', theirScore: undefined }), game({ id: '5', completed: false })])
  assert.equal(summary.record, '1–1')
  assert.equal(summary.played, 2)
  assert.equal(summary.scored, 5)
  assert.equal(summary.allowed, 5)
  assert.equal(summary.average, '2.5')
  assert.equal(seasonSummary([]).average, '—')
})

test('calendar skips unknown times, cancelled games and bad dates', () => {
  assert.equal(calendarGames([game(), game({ timeTbd: true }), game({ detail: 'Cancelled' }), game({ date: 'bad' })]).length, 1)
})

test('calendar uses UTC start time, stable IDs, escaped fields and CRLF', () => {
  const entry = game({ venue: 'Field, Chicago; IL', broadcast: 'TV\nChannel' })
  const text = buildCalendar(cubs, [entry], new Date('2026-09-17T12:00:00Z'))
  assert.match(text, /DTSTART:20260919T001000Z/)
  assert.match(text, /UID:cubs:1@chicago-sports.local/)
  assert.match(text, /LOCATION:Field\\, Chicago\\; IL/)
  assert.match(text, /Broadcast: TV\\nChannel/)
  assert.equal(text.replaceAll('\r\n', '').includes('\n'), false)
  assert.equal(text.includes('5–2'), false)
  assert.ok(text.endsWith('END:VCALENDAR\r\n'))
})

test('calendar folding respects 75 UTF-8 bytes, including multibyte characters', () => {
  const original = `SUMMARY:${'Chicago ★ '.repeat(30)}`
  const folded = foldLine(original)
  assert.equal(folded.replaceAll('\r\n ', ''), original)
  for (const line of folded.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75)
})

test('ticket IDs distinguish clubs and doubleheaders', () => {
  assert.notEqual(gameKey(cubs, game()), gameKey(TEAMS[1], game()))
  assert.notEqual(gameKey(cubs, game()), gameKey(cubs, game({ id: '2' })))
})

test('stored fan data recovers from invalid shape and filters broken tickets', () => {
  assert.deepEqual(normalizeFanData(null), { version: 1, spoiler: false, tickets: {}, answers: {} })
  const result = normalizeFanData({ spoiler: 'true', tickets: { valid: { teamKey: 'cubs', game: game(), kind: 'attended', note: 'x'.repeat(600) }, bad: null }, answers: { '2026-09-17': { choice: 2, correct: true }, nope: { choice: 1, correct: true } } })
  assert.equal(result.spoiler, false)
  assert.equal(Object.keys(result.tickets).length, 1)
  assert.equal(result.tickets.valid.note.length, 500)
  assert.equal(Object.keys(result.answers).length, 1)
})

test('daily question is stable across reloads, has one correct choice, and changes daily', () => {
  assert.deepEqual(dailyQuestion('2026-09-17'), dailyQuestion('2026-09-17'))
  assert.notEqual(dailyQuestion('2026-09-17').id, dailyQuestion('2026-09-18').id)
  assert.equal(new Set(QUESTIONS.map((q) => q.id)).size, QUESTIONS.length)
  for (const question of QUESTIONS) {
    assert.equal(question.choices.filter((c) => c === question.answer).length, 1)
    assert.equal(new Set(question.choices).size, 4)
  }
})

test('daily streak survives an unplayed today, breaks on a loss or missed day', () => {
  const answers = { '2026-09-15': { choice: 0, correct: true }, '2026-09-16': { choice: 1, correct: true } }
  assert.deepEqual(challengeStats(answers, '2026-09-17'), { current: 2, best: 2, wins: 2, played: 2 })
  assert.equal(challengeStats(answers, '2026-09-18').current, 0)
  assert.deepEqual(challengeStats({ ...answers, '2026-09-17': { choice: 0, correct: false } }, '2026-09-17'), { current: 0, best: 2, wins: 2, played: 3 })
})

test('every new view can be linked through URL state', () => {
  for (const tab of ['tonight', 'mygames', 'arcade', 'heatmap', 'rivalry', 'showdown']) {
    assert.equal(resolveState(`?team=cubs&season=2016&tab=${tab}`, 'cubs').tab, tab)
  }
})
