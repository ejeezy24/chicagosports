import test from 'node:test'
import assert from 'node:assert/strict'
import { videoLinks } from '../src/videos.js'

const team = { key: 'whitesox', name: 'Chicago White Sox' }
test('YouTube searches use the Chicago game date and matchup without scores', () => {
  const links = videoLinks(team, { game: { date: '2026-09-18T01:10:00Z', opponent: { name: 'Detroit Tigers' }, ourScore: 3, theirScore: 1, result: 'W' } })
  const queries = links.map(link => new URL(link.href).searchParams.get('search_query'))
  assert.deepEqual(queries, [
    'Chicago White Sox vs Detroit Tigers September 17, 2026 highlights',
    'Chicago White Sox vs Detroit Tigers September 17, 2026 full game',
  ])
  assert.ok(links.every(link => new URL(link.href).origin === 'https://www.youtube.com'))
})
test('archive dates stay on their calendar day and verified classics link directly', () => {
  const links = videoLinks(team, { moment: { date: '2005-10-26', title: 'South Side champions' } })
  assert.match(new URL(links[0].href).searchParams.get('search_query'), /October 26, 2005/)
  assert.equal(links[1].href, 'https://www.youtube.com/watch?v=HaAsMEN7qbA')
  const fallback = videoLinks(team, { moment: { date: 'invalid', title: 'A & B' } })
  assert.equal(new URL(fallback[1].href).searchParams.get('search_query'), 'Chicago White Sox A & B full game')
})
