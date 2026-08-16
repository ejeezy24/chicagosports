import { expect, test } from '@playwright/test'

test('archive views survive browser back and forward', async ({ page }) => {
  await page.goto('/?team=cubs&season=2016&tab=archive&view=history')
  await expect(page.getByRole('button', { name: 'Timeline' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page).toHaveTitle(/Timeline/)
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /view=history/)
  await page.getByRole('button', { name: 'Search' }).click()
  await expect(page).toHaveURL(/view=search/)
  await expect(page.getByRole('button', { name: 'Search' })).toHaveAttribute('aria-pressed', 'true')
  await page.goBack()
  await expect(page).toHaveURL(/view=history/)
  await expect(page.getByRole('button', { name: 'Timeline' })).toHaveAttribute('aria-pressed', 'true')
  await page.goForward()
  await expect(page).toHaveURL(/view=search/)
})

test('primary dynamic controls expose accessible state', async ({ page }) => {
  await page.route('**/espn/apis/site/v2/sports/baseball/mlb/teams/16/schedule**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ events: [{
      id: 'future-game', date: '2026-08-20T18:20:00Z', status: { type: { state: 'pre', completed: false, shortDetail: '1:20 PM' } },
      competitions: [{ venue: { fullName: 'Wrigley Field' }, competitors: [
        { homeAway: 'home', team: { id: '16', shortDisplayName: 'Cubs', abbreviation: 'CHC' } },
        { homeAway: 'away', team: { id: '24', shortDisplayName: 'Cardinals', abbreviation: 'STL' } },
      ] }],
    }] }),
  }))
  await page.goto('/?team=cubs&season=2026&tab=schedule')
  await expect(page.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main-content')
  await expect(page.locator('.today-status')).toHaveAttribute('aria-live', 'polite')
  await expect(page.getByRole('button', { name: 'Today', exact: true })).toHaveAttribute('aria-pressed', 'true')
  const month = page.locator('.month-toggle').first()
  await expect(month).toBeVisible({ timeout: 20_000 })
  const calendar = page.getByRole('button', { name: /Add Chicago Cubs vs Cardinals to calendar/ })
  await expect(calendar).toBeVisible()
  const downloadEvent = page.waitForEvent('download')
  await calendar.click()
  await expect((await downloadEvent).suggestedFilename()).toMatch(/\.ics$/)
  await expect(month).toHaveAttribute('aria-expanded', 'true')
  await expect(month).toHaveAttribute('aria-controls', /schedule-month-/)
  await expect(page.locator(`#${await month.getAttribute('aria-controls')}`)).toBeAttached()
  await month.click()
  await expect(month).toHaveAttribute('aria-expanded', 'false')
})

test('partial city scoreboard failures remain retryable', async ({ page }) => {
  await page.route('**/espn/apis/site/v2/sports/**/scoreboard?dates=*', (route) => {
    if (route.request().url().includes('/basketball/nba/')) return route.fulfill({ status: 503, body: '{}' })
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ events: [] }) })
  })
  await page.goto('/?team=cubs&season=2026&tab=archive')
  await expect(page.locator('.today-status')).toHaveText('Some league updates are delayed.', { timeout: 20_000 })
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible()
})
