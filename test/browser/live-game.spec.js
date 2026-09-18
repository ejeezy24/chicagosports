import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'
const payload = JSON.parse(readFileSync(new URL('../fixtures/live-mlb.json',import.meta.url),'utf8'))
const sox = { id:'4',displayName:'Chicago White Sox',shortDisplayName:'White Sox',abbreviation:'CHW' }
const opponents = { id:'6',displayName:'Detroit Tigers',shortDisplayName:'Tigers',abbreviation:'DET' }
async function setup(page, { parentLive=false, summaryLive=false, empty=false }={}) {
 await page.clock.install({time:new Date('2026-09-17T23:30:00Z')})
 let count=0
 let failed=false
 let final=false
 const competitors=[{homeAway:'home',team:sox,score:'5'},{homeAway:'away',team:opponents,score:'2'}]
 const event={id:'test-live',date:'2026-09-17T23:10:00Z',season:{year:2026,type:2},status:{type:{state:parentLive?'in':'post',completed:!parentLive,shortDetail:parentLive?'Bot 7th':'Final'}},competitions:[{competitors}]}
 await page.route('**/espn/**',route=>{
  const url=new URL(route.request().url())
  if(url.pathname.endsWith('/summary')){
   count++
   if(failed)return route.fulfill({status:404,json:{error:'Unavailable'}})
   const data=structuredClone(payload)
   data.header.competitions[0].status={type:{state:summaryLive&&!final?'in':'post',completed:!summaryLive||final,shortDetail:summaryLive&&!final?'Bot 7th':'Final'},period:7,displayClock:'0:00'}
   return route.fulfill({json:empty?{}:data})
  }
  if(url.pathname.endsWith('/schedule')||url.pathname.endsWith('/baseball/mlb/scoreboard'))return route.fulfill({json:{season:{year:2026,type:2},events:[event]}})
  return route.fulfill({json:{}})
 })
 await page.route('https://site.api.espn.com/**',route=>route.fulfill({status:404,json:{error:'Unavailable'}}))
 await page.goto('/?team=whitesox&season=2026&tab=schedule&game=test-live')
 return {count:()=>count,fail:()=>{failed=true},finish:()=>{final=true}}
}
test('summary live status starts polling and final stops it despite stale schedule state',async({page})=>{
 const feed=await setup(page,{summaryLive:true})
 await expect(page.locator('.live-status')).toHaveText('LIVE')
 await expect(page.locator('.live-status-row')).toContainText('Bot 7th')
 await expect(page.locator('.live-game-center .data-status')).toContainText('Data refreshed')
 expect(feed.count()).toBe(1)
 await page.clock.fastForward(31_000)
 await expect.poll(feed.count).toBe(2)
 feed.finish()
 await page.clock.fastForward(31_000)
 await expect(page.locator('.live-status-row')).toContainText('Final')
 const count=feed.count()
 await page.clock.fastForward(65_000)
 expect(feed.count()).toBe(count)
})
test('final summary overrides live parent; play list expands and refresh errors preserve score',async({page},testInfo)=>{
 await page.setViewportSize({width:390,height:844})
 const feed=await setup(page,{parentLive:true})
 await expect(page.locator('.live-status-row')).toContainText('Final')
 const count=feed.count()
 await page.clock.fastForward(65_000)
 expect(feed.count()).toBe(count)
 const plays=page.locator('details.live-plays').filter({has:page.locator('summary',{hasText:'Play-by-play'})})
 await plays.locator('summary').click()
 await expect(plays.locator('li')).toHaveCount(40)
 await plays.getByRole('button',{name:/Show earlier plays/}).click()
 await expect(plays.locator('li')).toHaveCount(80)
 await expect(page.locator('.boxscore .linescore')).toBeVisible()
 feed.fail()
 await page.locator('.live-scoreboard').getByRole('button',{name:'Refresh',exact:true}).click()
 await expect(page.locator('.live-game-center')).toContainText('Showing the last successful update.')
 await expect(page.locator('.live-scoreboard')).toBeVisible()
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390)
 // A page can have no horizontal overflow yet still hide scores inside an
 // oversized grid child. Check the actual game sections against their parent.
 const sectionsFit = await page.locator('.live-game-center').evaluate(center => {
  const bounds = center.getBoundingClientRect()
  return [...center.children].every(child => { const box = child.getBoundingClientRect(); return box.left >= bounds.left && box.right <= bounds.right })
 })
 expect(sectionsFit).toBe(true)
 const scoresFit = await page.locator('.live-team strong').evaluateAll(scores => scores.every(score => score.getBoundingClientRect().right <= document.querySelector('.live-game-center').getBoundingClientRect().right))
 expect(scoresFit).toBe(true)
 await page.screenshot({path:testInfo.outputPath('game-center-mobile.png'),fullPage:true})
})
test('empty summary has an honest unavailable state',async({page})=>{
 await setup(page,{empty:true})
 await expect(page.locator('.live-game-center')).toContainText('No game summary published')
 await expect(page.locator('.live-boxscore')).toHaveCount(0)
})
