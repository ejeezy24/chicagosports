import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { normalizeLiveGame, liveStateIsOngoing } from '../src/liveGame.js'
const fixture = (league) => JSON.parse(readFileSync(new URL(`./fixtures/live-${league}.json`, import.meta.url), 'utf8'))
const sports = { mlb: 'baseball', nfl: 'football', nba: 'basketball', nhl: 'hockey' }
for (const league of Object.keys(sports)) {
 test(`real ${league} summary provides canonical plays, performers, and final status`, () => {
  const data = fixture(league)
  const model = normalizeLiveGame(data, { sport: sports[league], espnId: '4' })
  assert.equal(model.completed, true)
  assert.equal(liveStateIsOngoing(model), false)
  assert.ok(model.plays.length > 30)
  assert.ok(model.scoringPlays.length > 0)
  assert.ok(model.performers.length > 0)
  assert.equal(new Set(model.plays.map(p=>p.id)).size, model.plays.length)
  if (league === 'mlb') {
   const expected = data.plays.filter(play=>play.type?.type==='play-result')
   assert.deepEqual(model.plays.map(p=>p.id),expected.map(p=>p.id))
   assert.match(model.plays.at(-1).period,/Top 9th/)
  }
  if (league === 'nfl') {
   assert.match(model.plays[0].period,/1st Quarter/)
   assert.match(model.plays[0].clock,/\d+:\d+/)
  }
  if (league === 'nba' || league === 'nfl') {
   const leader = data.leaders[0].leaders[0].leaders[0]
   assert.ok(model.performers.some(p=>p.detail.startsWith(leader.displayValue)))
  }
 })
}
test('overlapping drive entries appear once, in source order', () => {
 const a={id:'a',text:'First play',period:{number:1},clock:{displayValue:'15:00'}}
 const b={id:'b',text:'Second play'}
 const model=normalizeLiveGame({drives:{previous:[{plays:[a,b]}],current:{plays:[b,{id:'c',text:'Latest'}]}}},{sport:'football'})
 assert.deepEqual(model.plays.map(p=>p.id),['a','b','c'])
})
test('reads live period and clock from the competition status, retaining source detail',()=>{
 const model=normalizeLiveGame({header:{competitions:[{status:{type:{state:'in',shortDetail:'Halftime'},period:2,displayClock:'0:00'}}]}},{sport:'football'})
 assert.equal(model.period,'2nd Quarter')
 assert.equal(model.clock,'0:00')
 assert.equal(model.status,'Halftime')
 assert.equal(liveStateIsOngoing(model),true)
})
test('absent plays, performers, and scores stay unavailable',()=>{
 const model=normalizeLiveGame({}, {sport:'baseball'})
 assert.deepEqual(model.performers,[])
 assert.deepEqual(model.teams,[])
 assert.equal(model.hasPlayData,false)
 assert.equal(liveStateIsOngoing(model),false)
})
