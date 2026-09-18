import test from 'node:test'
import assert from 'node:assert/strict'
import { getSummary, getScoreboard, getStandings, getSchedule } from '../src/api.js'

test('returning to a live feed expires stale client data and fresh refresh bypasses it',async()=>{
 const oldFetch=globalThis.fetch
 const oldNow=Date.now
 let clock=1_000_000
 let calls=0
 Date.now=()=>clock
 globalThis.fetch=async()=>({ok:true,text:async()=>JSON.stringify({version:++calls})})
 const team={sport:'baseball',league:'mlb',espnId:'4'}
 try{
  for(const load of [()=>getSummary(team,'cache-test'),()=>getScoreboard(team),()=>getSchedule(team,2026)]){
   const first=await load()
   assert.deepEqual(await load(),first)
   clock+=31_000
   assert.notDeepEqual(await load(),first)
  }
  const standings=await getStandings(team,2026)
  clock+=31_000
  assert.deepEqual(await getStandings(team,2026),standings)
  clock+=31_000
  assert.notDeepEqual(await getStandings(team,2026),standings)
  assert.notDeepEqual(await getSummary(team,'cache-test'),await getSummary(team,'cache-test',{fresh:true}))
 }finally{globalThis.fetch=oldFetch;Date.now=oldNow}
})
