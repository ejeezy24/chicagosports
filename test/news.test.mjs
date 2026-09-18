import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeNews, newsUrl } from '../src/news.js'
import { teamByKey } from '../src/teams.js'
const team = teamByKey('cubs')
const article = (id, extra = {}) => ({ id, headline: `Story ${id}`, published: '2026-09-18T12:00:00Z', links: { web: { href: `https://www.espn.com/story/${id}` } }, categories: [{ type: 'team', teamId: 16, description: 'Chicago Cubs' }], ...extra })

test('news keeps tagged team stories, deduplicates and sorts by publication', () => {
  const stories = normalizeNews({ articles: [article(1), article(2, { categories: [{ type: 'team', teamId: 4 }] }), article(3, { published: '2026-09-18T15:00:00Z' }), article(1)] }, team)
  assert.deepEqual(stories.map(s => s.id), ['3', '1'])
  assert.equal(normalizeNews({ articles: [article(1, { categories: [{ type: 'team', teamId: 16, description: 'Unrelated team' }] })] }, team).length, 0)
})
test('news tolerates missing fields and blocks non-web article links', () => {
  assert.deepEqual(normalizeNews({}, team), [])
  assert.deepEqual(normalizeNews({ articles: [null, article(1, { links: { web: { href: 'javascript:alert(1)' } } })] }, team), [])
  assert.equal(newsUrl('http://www.espn.com/example'), 'https://www.espn.com/example')
  assert.equal(newsUrl('https://user:password@example.com'), null)
  assert.equal(normalizeNews({ articles: [article(1, { published: 'bad date' })] }, team)[0].published, null)
})
