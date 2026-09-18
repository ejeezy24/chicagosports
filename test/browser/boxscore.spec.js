import { test, expect } from '@playwright/test'

const sox = { id: '4', shortDisplayName: 'White Sox', displayName: 'Chicago White Sox', abbreviation: 'CHW' }
const tigers = { id: '6', shortDisplayName: 'Tigers', displayName: 'Detroit Tigers', abbreviation: 'DET' }
const competitors = [
  { homeAway: 'home', team: sox, score: '3', linescores: [{ value: 2 }, { value: 1 }], hits: 4, errors: 0 },
  { homeAway: 'away', team: tigers, score: '1', linescores: [{ value: 0 }, { value: 1 }], hits: 2, errors: 0 },
]
const summary = {
  header: { competitions: [{ competitors }] },
  boxscore: { players: [{ team: sox, statistics: [{ type: 'batting', labels: ['AB', 'H', 'RBI'], athletes: [
    { athlete: { id: 'test-player', displayName: 'Test batter' }, stats: ['2', '1', '2'] },
  ] }] }] },
}

for (const state of ['in', 'post']) {
  test(`${state === 'in' ? 'live city scoreboard' : 'completed schedule'} game loads the selected boxscore`, async ({ page }, testInfo) => {
    await page.clock.setFixedTime(new Date('2026-09-17T23:30:00Z'))
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 390, height: 844 })
    const event = {
      id: `sox-${state}`, date: '2026-09-17T23:10:00Z', season: { year: 2026, type: 2 },
      status: { type: { state, completed: state === 'post', shortDetail: state === 'in' ? 'Bot 4th' : 'Final' } },
      competitions: [{ competitors }],
    }
    const requestedEvents = []
    await page.route('**/espn/**', (route) => {
      const url = new URL(route.request().url())
      if (url.pathname.endsWith('/summary')) {
        const id = url.searchParams.get('event')
        requestedEvents.push(id)
        return route.fulfill(id === event.id
          ? { json: summary }
          : { status: 400, json: { error: 'Missing or incorrect event' } })
      }
      if (url.pathname.endsWith('/teams/4/schedule') || url.pathname.endsWith('/baseball/mlb/scoreboard')) {
        return route.fulfill({ json: { season: { year: 2026, type: 2 }, events: [event] } })
      }
      return route.fulfill({ json: {} })
    })
    // Block the external fallback so this regression fails on the actual request.
    await page.route('https://site.api.espn.com/**', (route) => route.abort())
    await page.goto(`/?team=${state === 'in' ? 'cubs' : 'whitesox'}&season=2026&tab=schedule`)
    if (state === 'in') {
      await page.locator('.today-games button').filter({ hasText: 'White Sox' }).click()
    } else {
      await page.getByRole('button', { name: /Show boxscore.*Tigers/ }).click()
    }
    await expect.poll(() => requestedEvents).toEqual([event.id])
    await expect(page).toHaveURL(new RegExp(`team=whitesox.*game=${event.id}`))
    const box = page.locator('.boxscore')
    await expect(box.locator('.linescore tbody tr')).toHaveCount(2)
    await expect(box.locator('.linescore tr.me td.tot').first()).toHaveText('3')
    await expect(box.locator('.players-table')).toContainText('Test batter')
    await expect(box.locator('.players-table tbody td')).toHaveText(['2', '1', '2'])
    await expect(box).not.toContainText("Couldn't load")
    await page.screenshot({ path: testInfo.outputPath(`boxscore-${state}-mobile.png`) })
    requestedEvents.length = 0
    await page.reload()
    await expect.poll(() => requestedEvents).toEqual([event.id])
    await expect(box.locator('.players-table')).toContainText('Test batter')
  })
}
