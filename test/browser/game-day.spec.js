import { test, expect } from '@playwright/test'

const fixture = (id, date, state = 'pre', type = 2) => ({
  id, date, season: { year: 2026, type },
  status: { type: { state, completed: state === 'post', shortDetail: state === 'pre' ? '10/6 - 2:20 PM EDT' : 'Final' } },
  competitions: [{ venue: { fullName: 'Wrigley Field' }, broadcasts: [{ names: ['Test Sports'] }], competitors: [
    { homeAway: 'home', score: '5', team: { id: '16', shortDisplayName: 'Cubs', abbreviation: 'CHC' } },
    { homeAway: 'away', score: '3', team: { id: '24', shortDisplayName: 'Cardinals', abbreviation: 'STL' } },
  ] }],
})

async function gameFeeds(page, { type = 2, cached = false } = {}) {
  await page.clock.setFixedTime(new Date('2026-09-05T17:00:00Z'))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => {
    globalThis.__copiedGameLink = ''
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (text) => { globalThis.__copiedGameLink = text } } })
  })
  await page.route('**/espn/**', (route) => route.fulfill({ json: {} }))
  const next = fixture('preview-game', '2026-10-06T18:20:00Z', 'pre', type)
  await page.route('**/espn/apis/site/v2/sports/baseball/mlb/teams/16/schedule**', (route) => route.fulfill({ json: { events: [next] } }))
  if (cached) {
    await page.addInitScript(() => localStorage.setItem('cs.scoreboard.20260905', JSON.stringify({ savedAt: new Date('2026-09-05T17:00:00Z').getTime(), rows: [{ teamKey: 'cubs', team: 'Cubs', eventId: 'preview-game', date: '2026-10-06T18:20:00Z', status: '1:20 PM', detail: 'vs Cardinals' }] })))
    await page.route('**/espn/**/scoreboard**', (route) => route.abort())
  } else {
    await page.route('**/espn/apis/site/v2/sports/baseball/mlb/scoreboard**', (route) => route.fulfill({ json: { season: { year: 2026, type }, events: [next] } }))
  }
}

test('upcoming game preview shares and restores without requesting a boxscore', async ({ page }) => {
  await gameFeeds(page)
  let summaries = 0
  await page.route('**/espn/**/summary**', (route) => { summaries++; return route.fulfill({ json: {} }) })
  await page.goto('/?team=cubs&season=2026&tab=schedule&game=preview-game')
  const preview = page.locator('.game-preview')
  await expect(preview).toBeVisible()
  await expect(preview).toContainText('Chicago Cubs vs Cardinals')
  await expect(preview).toContainText('Chicago time')
  await expect(preview).toContainText('Wrigley Field')
  await expect(preview).toContainText('Test Sports')
  await expect(page.locator('.g-toggle[aria-expanded="true"]')).toBeInViewport()
  await expect(page.locator('.boxscore')).toHaveCount(0)
  expect(summaries).toBe(0)
  await page.getByRole('button', { name: 'Copy game link', exact: true }).click()
  await expect.poll(() => page.evaluate(() => globalThis.__copiedGameLink)).toContain('game=preview-game')
  const download = page.waitForEvent('download')
  await preview.getByRole('button', { name: 'Add this game to calendar' }).click()
  expect((await download).suggestedFilename()).toMatch(/\.ics$/)
  await page.reload()
  await expect(preview).toBeVisible()
  expect(summaries).toBe(0)
})

for (const cached of [false, true]) {
  test(`city game cards navigate from an archive to exact game state (${cached ? 'legacy cache' : 'postseason feed'})`, async ({ page }) => {
    await gameFeeds(page, { type: cached ? 2 : 3, cached })
    await page.goto('/?team=bears&season=2016&tab=archive&view=history')
    await page.locator('.today-games button').filter({ hasText: 'Cubs' }).click()
    await expect(page).toHaveURL(/team=cubs&season=2026&tab=schedule/)
    await expect(page).toHaveURL(/game=preview-game/)
    if (!cached) await expect(page).toHaveURL(/type=3/)
    await expect(page.locator('.game-preview')).toBeVisible()
    await expect(page.locator('.g-toggle[aria-expanded="true"]')).toBeInViewport()
    await page.goBack()
    await expect(page).toHaveURL(/team=bears&season=2016&tab=archive&view=history/)
    await page.goForward()
    await expect(page.locator('.game-preview')).toBeVisible()
    await page.reload()
    await expect(page.locator('.game-preview')).toBeVisible()
  })
}


test('upcoming preview stays legible and touch-friendly on narrow phones', async ({ page }, testInfo) => {
  await gameFeeds(page)
  await page.setViewportSize({ width: 320, height: 844 })
  await page.goto('/?team=cubs&season=2026&tab=schedule&game=preview-game')
  const preview = page.locator('.game-preview')
  await expect(preview).toBeVisible()
  const button = preview.getByRole('button', { name: 'Add this game to calendar' })
  expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(44)
  expect(await preview.locator('h3').evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(14)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
  await expect(page.locator('.game')).not.toContainText('EDT')
  await preview.scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('preview-mobile.png') })
})
