import test from 'node:test'
import assert from 'node:assert/strict'
import { upstreamCacheControl } from '../api/upstream.js'

test('live game feeds expire before the next polling interval without stale responses', () => {
  for (const endpoint of ['scoreboard', 'summary', 'playbyplay', 'teams/4', 'teams/4/schedule']) {
    const policy = upstreamCacheControl('site', `apis/site/v2/sports/baseball/mlb/${endpoint}`, 200)
    assert.match(policy, /max-age=0/)
    assert.match(policy, /s-maxage=15/)
    assert.match(policy, /must-revalidate/)
    assert.doesNotMatch(policy, /stale-while-revalidate/)
  }
})

test('standings refresh on a short window while archive requests retain their cache', () => {
  assert.match(upstreamCacheControl('site', 'apis/v2/sports/baseball/mlb/standings', 200), /s-maxage=60/)
  assert.match(upstreamCacheControl('mlb', 'api/v1/teams/145/roster', 200), /s-maxage=300/)
})

test('upstream failures are never cached as game data', () => {
  for (const status of [400, 404, 429, 502, 504]) {
    assert.equal(upstreamCacheControl('site', 'apis/site/v2/sports/baseball/mlb/summary', status), 'no-store')
  }
})
