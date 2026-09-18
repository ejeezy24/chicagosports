import test from 'node:test'
import assert from 'node:assert/strict'
import { clinchingStatus, normalizeRaceStandings, normalizeRemaining, raceColumns } from '../src/playoffRace.js'
import fs from 'node:fs'

const team = { espnId: '4', sport: 'baseball' }
const entry = (id, name, stats = []) => ({ team: { id, displayName: name }, stats })

test('preserves group ancestry and exact clinching descriptions', () => {
  const out = normalizeRaceStandings({ season: { year: 2026 }, name: 'American League', children: [{ name: 'Central', standings: { entries: [entry('4', 'White Sox', [{ name: 'clincher', description: 'Clinched Division', displayValue: 'x' }])] } }] }, 2026)
  assert.deepEqual(out.groups[0].ancestry, ['American League', 'Central'])
  assert.equal(clinchingStatus(out.groups[0].rows[0]), 'Clinched Division')
  assert.equal(normalizeRaceStandings({ season: { year: 2025 }, children: [] }, 2026).seasonMismatch, true)
})

test('does not treat baseball GBP as hockey points', () => {
  const row = { stats: [{ key: 'points', label: 'Points', displayValue: '88' }, { key: 'gamesBehind', abbreviation: 'GBP', label: 'GB', displayValue: '2.0' }] }
  assert.deepEqual(raceColumns({ sport: 'baseball' }, row).map((stat) => stat.displayValue), ['2.0'])
  assert.deepEqual(raceColumns({ sport: 'hockey' }, row).map((stat) => stat.displayValue), ['88', '2.0'])
})

test('accepts representative ESPN level 3 payloads for all four leagues', () => {
  for (const sport of ['mlb', 'nfl', 'nba', 'nhl']) {
    const payload = JSON.parse(fs.readFileSync(new URL(`./fixtures/race-${sport}.json`, import.meta.url)))
    const out = normalizeRaceStandings(payload, 2026)
    assert.equal(out.seasonMismatch, false, sport)
    assert.ok(out.groups.length > 0, sport)
    assert.ok(out.groups[0].ancestry.length >= 2, sport)
  }
})

test('remaining schedule excludes finished, canceled, and postponed games', () => {
  const payload = { season: { year: 2026 }, events: [
    { id: 'a', date: '2026-09-20T00:00:00Z', competitions: [{ competitors: [{ homeAway: 'home', team: { id: '4', displayName: 'Sox' } }, { homeAway: 'away', team: { id: '6', displayName: 'Tigers' } }], status: { type: { state: 'pre' } } }] },
    { id: 'b', date: '2026-09-21T00:00:00Z', competitions: [{ competitors: [{ team: { id: '4' } }, { team: { id: '6' } }], status: { type: { state: 'post', completed: true } } }] },
    { id: 'c', date: '2026-09-22T00:00:00Z', competitions: [{ competitors: [{ team: { id: '4' } }, { team: { id: '6' } }], status: { type: { state: 'pre', description: 'Postponed' } } }] },
  ] }
  assert.deepEqual(normalizeRemaining(payload, team, 2026).games.map((game) => game.id), ['a'])
})

test('unknown clinching symbols and general stat descriptions do not imply qualification', () => {
 assert.equal(clinchingStatus({stats:[{key:'wins',description:'Wins'},{key:'clincher',displayValue:'x',description:'Clinching Status'}]}),'No clinching status reported.')
 assert.equal(normalizeRaceStandings({season:null},2026).seasonMismatch,false)
})
test('real MLB conference feed preserves seed, leader-relative games back, and season validation',()=>{
 const payload=JSON.parse(fs.readFileSync(new URL('./fixtures/race-mlb-level2.json',import.meta.url)))
 const result=normalizeRaceStandings(payload,2026)
 const group=result.groups.find(g=>g.name==='National League')
 const cubs=group.rows.find(row=>row.id==='16')
 assert.equal(cubs.stats.find(s=>s.key==='playoffSeed').value,4)
 assert.equal(cubs.stats.find(s=>s.key==='gamesBehind').value,10)
 assert.equal(normalizeRaceStandings(payload,2016).groups.length,0)
})
