import test from 'node:test'
import assert from 'node:assert/strict'
import { teamByKey } from '../src/teams.js'
import { normalizeLiveGame } from '../src/liveGame.js'
import { blankLineup, curatedPlayers, placePlayer, normalizeLineup, lineupFromHash, lineupHash, writeSavedLineup } from '../src/lineup.js'
import { posterLines } from '../src/poster.js'
const cubs = teamByKey('cubs')

test('lineup moves swap slots and shares unicode entries without trusting embedded links', () => {
  const legend = curatedPlayers(cubs)[0]
  let lineup = placePlayer(blankLineup(cubs), 'SS', legend, cubs)
  lineup = placePlayer(lineup, 'C', { id:'custom', name:'José Example', era:'1990–95', sourceType:'curated', sourceUrl:'javascript:alert(1)' }, cubs)
  lineup = placePlayer(lineup, 'C', legend, cubs)
  assert.equal(lineup.slots.C.name, legend.name)
  assert.equal(lineup.slots.SS.name, 'José Example')
  assert.equal(lineup.slots.SS.sourceUrl, null)
  const restored = lineupFromHash(lineupHash(lineup, cubs), cubs)
  assert.deepEqual(restored, lineup)
  assert.equal(lineupFromHash('#lineup=' + 'a'.repeat(12001), cubs), null)
  assert.deepEqual(normalizeLineup({ teamKey:'cubs', slots:null }, cubs), blankLineup(cubs))
  assert.deepEqual(lineupFromHash(lineupHash(lineup, cubs), teamByKey('bulls')).slots, blankLineup(teamByKey('bulls')).slots)
  assert.equal(writeSavedLineup(cubs, lineup, { setItem() { throw Error('Blocked') } }), false)
})
test('live situation distinguishes unknown from empty bases and preserves play score snapshots', () => {
  const payload = { situation:{ balls:2, strikes:1, outs:0, onFirst:true, onSecond:false, pitchCount:64 }, plays:[{ id:'p1', text:'A run scores', homeScore:1, awayScore:0 }] }
  const game = normalizeLiveGame(payload,cubs)
  assert.equal(game.situation.first,true); assert.equal(game.situation.second,false); assert.equal(game.situation.third,null)
  assert.equal(game.situation.outs,0); assert.equal(game.situation.pitchCount,64)
  assert.equal(game.plays[0].homeScore,1); assert.equal(game.plays[0].awayScore,0)
  assert.equal(normalizeLiveGame({},cubs).situation,null)
  assert.equal(normalizeLiveGame({situation:{onFirst:'false',balls:{bad:1}}},cubs).situation.first,null)
  assert.equal(normalizeLiveGame({situation:{balls:{bad:1}}},cubs).situation.balls,null)
})
test('poster captions wrap long words and cap output without overflowing', () => {
  const context = { measureText: text => ({width:Array.from(text).length*10}) }
  const lines = posterLines(context, 'abcdefghijklmnopqrstuvwxyz', 60, 3)
  assert.equal(lines.length,3); assert.ok(lines.every(line=>line.length<=6)); assert.ok(lines.at(-1).endsWith('…'))
})
