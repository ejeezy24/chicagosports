import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyGame, loadFinderSchedules, verifyWalkoffCandidates, walkoffEvidence } from '../src/greatGames.js'

const team = { sport: 'football', espnId: '3' }
const game = (overrides = {}) => ({ completed: true, result: 'W', ourScore: '24', theirScore: '17', detail: null, _finderMeta: {}, ...overrides })

test('classifies close games and does not infer a walk-off from a one-run win', () => {
  assert.deepEqual(classifyGame(game({ ourScore: 5, theirScore: 4 }), { sport: 'baseball' }), ['close'])
  assert.deepEqual(classifyGame(game({ ourScore: 5, theirScore: 4 }), { sport: 'baseball', }), ['close'])
  assert.equal(classifyGame(game({ ourScore: 5, theirScore: 4 }), { sport: 'baseball' }).includes('walkoff'), false)
  assert.equal(classifyGame(game({ ourScore: 0, theirScore: 0, result: 'T' }), { sport: 'baseball' }).length, 0)
  assert.equal(classifyGame(game({ ourScore: 0, theirScore: 3, result: 'L' }), { sport: 'baseball' }).includes('shutout'), true)
})

test('requires explicit extra-period evidence', () => {
  assert.equal(classifyGame(game({ _finderMeta: { period: 5 } }), team).includes('extra'), true)
  assert.equal(classifyGame(game({ _finderMeta: { period: 5 } }), { sport: 'baseball' }).includes('extra'), false)
  assert.equal(classifyGame(game({ _finderMeta: { text: 'Final, walk-off' } }), { sport: 'baseball' }).includes('walkoff'), false)
})

test('loads selected seasons with at most three requests and retains partial results', async () => {
  let active = 0; let peak = 0
  const data = await loadFinderSchedules(team, [2020, 2021, 2022, 2023, 2024], { getScheduleImpl: async (_team, season) => {
    active++; peak = Math.max(peak, active); await new Promise((resolve) => setTimeout(resolve, 2)); active--
    if (season === 2022) throw new Error('unavailable')
    return { events: [{ id: String(season), date: `${season}-10-01T00:00:00Z`, season: { year: season }, competitions: [{ competitors: [{ team: { id: '3' }, homeAway: 'home', winner: true, score: '24' }, { team: { id: '9' }, homeAway: 'away', score: '0' }], status: { type: { state: 'post', completed: true } } }] }] }
  } })
  assert.equal(peak <= 3, true)
  assert.deepEqual(data.failures.map((failure) => failure.season), [2022])
  assert.equal(data.games.length, 4)
})

test('verifies a seven-inning walk-off only from the final bottom scoring play', () => {
  const candidate = { id: 'seven', home: true, completed: true, result: 'W' }
  const payload = {
    format: { regulation: { periods: 7 } },
    header: { competitions: [{ competitors: [{ homeAway: 'home', score: '4' }, { homeAway: 'away', score: '3' }] }] },
    scoringPlays: [{ scoringPlay: true, period: { number: 7, displayValue: 'Bottom 7th' }, homeScore: '4', awayScore: '3', text: 'Walk-off single' }],
  }
  assert.equal(walkoffEvidence(payload, candidate, { sport: 'baseball' }), 'yes')
  assert.equal(walkoffEvidence(payload, { ...candidate, home: false }, { sport: 'baseball' }), 'no')
})

test('normal completed home win without canonical walk-off evidence remains unknown', () => {
  const candidate = { id: 'normal', home: true, completed: true, result: 'W' }
  assert.equal(walkoffEvidence({ header: { competitions: [{ competitors: [{ homeAway: 'home', score: '4' }, { homeAway: 'away', score: '3' }] }] }, news: [{ headline: 'walk-off unrelated story' }] }, candidate, { sport: 'baseball' }), 'unknown')
})

test('walk-off verification is bounded, concurrent, and retains failed and unknown summaries', async () => {
  const candidates = Array.from({ length: 14 }, (_, id) => ({ id: String(id), home: true, completed: true, result: 'W' }))
  let active = 0; let peak = 0
  const data = await verifyWalkoffCandidates({ sport: 'baseball' }, candidates, { getSummaryImpl: async (_team, id) => {
    active++; peak = Math.max(peak, active); await new Promise((resolve) => setTimeout(resolve, 2)); active--
    if (id === '1') throw new Error('summary unavailable')
    if (id === '2') return { header: { competitions: [{ competitors: [{ homeAway: 'home', score: '1' }, { homeAway: 'away', score: '0' }] }] } }
    return { header: { competitions: [{ competitors: [{ homeAway: 'home', score: '1' }, { homeAway: 'away', score: '0' }] }] }, format: { regulation: { periods: 9 } }, scoringPlays: [{ period: { number: 9, displayValue: 'Bottom 9th' }, homeScore: '1', awayScore: '0', text: 'Walk-off single', scoringPlay: true }] }
  } })
  assert.equal(peak <= 3, true)
  assert.equal(data.checked, 12)
  assert.equal(data.remaining, 2)
  assert.equal(data.failures.length, 1)
  assert.equal(data.unknown.length, 1)
  assert.equal(data.verified.length, 10)
})

test('missing scores, cancellation, and tied scores never become memorable wins', () => {
  for (const score of [null, undefined, '', ' ']) assert.deepEqual(classifyGame(game({ ourScore: score }), team), [])
  assert.deepEqual(classifyGame(game({ detail: 'Canceled', ourScore: 40, theirScore: 0 }), team), [])
  assert.deepEqual(classifyGame(game({ ourScore: 0, theirScore: 0 }), team), [])
  assert.deepEqual(classifyGame(game({ ourScore: 0, theirScore: 2 }), { sport: 'basketball' }), ['close'])
})
test('infers a seven-inning walk-off only from the final canonical lead-changing play', () => {
  const candidate={home:true,completed:true,result:'W'}
  const baseball={sport:'baseball',espnId:'4'}
  const play=(home,away,scoring=false)=>({type:{type:'play-result'},homeScore:home,awayScore:away,scoringPlay:scoring,period:{number:7,type:'Bottom'},text:'Single to left'})
  const payload={format:{regulation:{periods:7}},header:{competitions:[{status:{type:{state:'post',completed:true}},competitors:[{homeAway:'home',team:{id:'4'},score:'4'},{homeAway:'away',score:'3'}]}]},plays:[play(3,3),play(4,3,true)]}
  assert.equal(walkoffEvidence(payload,candidate,baseball),'yes')
  assert.equal(walkoffEvidence({...payload,plays:[play(3,2),play(4,3,true)]},candidate,baseball),'no')
  assert.equal(walkoffEvidence({...payload,plays:[...payload.plays,play(4,3)]},candidate,baseball),'no')
  assert.equal(walkoffEvidence({...payload,format:undefined},candidate,baseball),'unknown')
  assert.equal(walkoffEvidence(payload,{...candidate,completed:false},baseball),'no')
})

test('archive event years override ESPN current-year schedule headers, but wrong games are rejected', async () => {
 const payload={season:{year:2026},events:[{id:'archive',date:'2016-06-01T00:00:00Z',season:{year:2016},status:{type:{state:'post',completed:true}},competitions:[{competitors:[{team:{id:'3'},homeAway:'home',winner:true,score:'24'},{team:{id:'9'},homeAway:'away',score:'0'}]}]}]}
 const valid=await loadFinderSchedules(team,[2016],{getScheduleImpl:async()=>payload})
 assert.equal(valid.games.length,1)
 assert.equal(valid.failures.length,0)
 const wrong=await loadFinderSchedules(team,[2015],{getScheduleImpl:async()=>payload})
 assert.equal(wrong.games.length,0)
 assert.equal(wrong.failures.length,1)
})
