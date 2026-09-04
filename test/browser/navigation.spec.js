import { expect, test } from '@playwright/test'

async function mockCompletedCubsGame(page) {
  await page.route('**/espn/apis/site/v2/sports/baseball/mlb/teams/16/schedule**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ events: [{
      id: 'final-game', date: '2026-08-20T18:20:00Z', status: { type: { state: 'post', completed: true, shortDetail: 'Final' } },
      competitions: [{ competitors: [
        { homeAway: 'home', winner: true, score: '5', team: { id: '16', shortDisplayName: 'Cubs', abbreviation: 'CHC' } },
        { homeAway: 'away', winner: false, score: '3', team: { id: '24', shortDisplayName: 'Cardinals', abbreviation: 'STL' } },
      ] }],
    }] }),
  }))
  await page.route('**/espn/apis/site/v2/sports/baseball/mlb/summary?event=final-game', (route) => route.fulfill({
    contentType: 'application/json', body: JSON.stringify({ boxscore: {} }),
  }))
}

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
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route('**/espn/apis/site/v2/sports/baseball/mlb/teams/16/schedule**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ events: [{
      id: 'future-game', date: '2026-12-20T19:20:00Z', status: { type: { state: 'pre', completed: false, shortDetail: '1:20 PM' } },
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
  const scheduleCalendar = page.getByRole('button', { name: 'Add Chicago Cubs upcoming schedule to calendar' })
  await expect(scheduleCalendar).toBeVisible()
  const scheduleDownload = page.waitForEvent('download')
  await scheduleCalendar.click()
  await expect((await scheduleDownload).suggestedFilename()).toBe('cubs-upcoming-schedule.ics')
  const downloadEvent = page.waitForEvent('download')
  await calendar.click()
  await expect((await downloadEvent).suggestedFilename()).toMatch(/\.ics$/)
  await expect(month).toHaveAttribute('aria-expanded', 'true')
  await expect(month).toHaveAttribute('aria-controls', /schedule-month-/)
  await expect(page.locator(`#${await month.getAttribute('aria-controls')}`)).toBeAttached()
  const controlHeights = await page.locator('.panel-controls button').evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect().height))
  expect(controlHeights.every((height) => height >= 44)).toBe(true)
  await month.click()
  await expect(month).toHaveAttribute('aria-expanded', 'false')
})

test('completed games have shareable back-and-forward detail state', async ({ page }) => {
  await page.addInitScript(() => {
    globalThis.__copiedGameLink = ''
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (value) => { globalThis.__copiedGameLink = value } } })
  })
  await mockCompletedCubsGame(page)
  await page.goto('/?team=cubs&season=2026&tab=schedule')
  await page.getByRole('button', { name: 'Postseason' }).click()
  await expect(page).toHaveURL(/type=3/)
  const details = page.getByRole('button', { name: /Show boxscore.*Cardinals/ })
  await expect(details).toBeVisible()
  await details.click()
  await page.getByRole('button', { name: 'Copy game link' }).click()
  await expect(page).toHaveURL(/game=final-game/)
  await expect(page.getByRole('button', { name: /Hide boxscore.*Cardinals/ })).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByRole('button', { name: 'Game link copied' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => globalThis.__copiedGameLink)).toMatch(/game=final-game/)
  await page.goBack()
  await expect(page).not.toHaveURL(/game=/)
  await expect(page.getByRole('button', { name: /Show boxscore.*Cardinals/ })).toHaveAttribute('aria-expanded', 'false')
  await page.goForward()
  await expect(page).toHaveURL(/game=final-game/)
  await expect(page).toHaveTitle(/Game details/)
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /type=3&game=final-game/)
  await expect(page.getByRole('button', { name: /Hide boxscore.*Cardinals/ })).toHaveAttribute('aria-expanded', 'true')
  await page.reload()
  await expect(page.getByRole('button', { name: 'Postseason' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: /Hide boxscore.*Cardinals/ })).toHaveAttribute('aria-expanded', 'true')
})

test('game link copy falls back when clipboard permission is denied', async ({ page }) => {
  await page.addInitScript(() => {
    globalThis.__fallbackCopied = ''
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('denied') } } })
    document.execCommand = () => {
      globalThis.__fallbackCopied = document.activeElement?.value ?? ''
      return true
    }
  })
  await mockCompletedCubsGame(page)
  await page.goto('/?team=cubs&season=2026&tab=schedule&type=3&game=final-game')
  await page.getByRole('button', { name: 'Copy game link' }).click()
  await expect(page.getByRole('button', { name: 'Game link copied' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => globalThis.__fallbackCopied)).toMatch(/game=final-game/)
})

test('stale copy failures cannot overwrite the latest success', async ({ page }) => {
  await page.addInitScript(() => {
    globalThis.__copyCalls = 0
    globalThis.__copiedGameLink = ''
    globalThis.__fallbackCalls = 0
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText(value) {
        globalThis.__copyCalls += 1
        if (globalThis.__copyCalls === 1) return new Promise((resolve, reject) => { globalThis.__rejectFirstCopy = () => reject(new Error('late failure')) })
        globalThis.__copiedGameLink = value
        return Promise.resolve()
      },
    } })
    document.execCommand = () => { globalThis.__fallbackCalls += 1; return false }
    window.prompt = () => { globalThis.__fallbackCalls += 1; return null }
  })
  await mockCompletedCubsGame(page)
  await page.goto('/?team=cubs&season=2026&tab=schedule&type=3&game=final-game')
  const copy = page.getByRole('button', { name: 'Copy game link' })
  await copy.click()
  await copy.click()
  await expect(page.getByRole('button', { name: 'Game link copied' })).toBeVisible()
  await page.evaluate(() => globalThis.__rejectFirstCopy())
  await page.waitForTimeout(100)
  await expect(page.getByRole('button', { name: 'Game link copied' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => globalThis.__copiedGameLink)).toMatch(/game=final-game/)
  expect(await page.evaluate(() => globalThis.__fallbackCalls)).toBe(0)
})

test('unmounting a game cancels pending copy fallbacks', async ({ page }) => {
  await page.addInitScript(() => {
    globalThis.__unmountedFallbackCalls = 0
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText() { return new Promise((resolve, reject) => { globalThis.__rejectUnmountedCopy = () => reject(new Error('late failure')) }) },
    } })
    document.execCommand = () => { globalThis.__unmountedFallbackCalls += 1; return false }
    window.prompt = () => { globalThis.__unmountedFallbackCalls += 1; return null }
  })
  await mockCompletedCubsGame(page)
  await page.goto('/?team=cubs&season=2026&tab=schedule&type=3&game=final-game')
  await page.getByRole('button', { name: 'Copy game link' }).click()
  await page.getByRole('tab', { name: 'Chicago Archive' }).click()
  await page.evaluate(() => globalThis.__rejectUnmountedCopy())
  await page.waitForTimeout(100)
  expect(await page.evaluate(() => globalThis.__unmountedFallbackCalls)).toBe(0)
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
