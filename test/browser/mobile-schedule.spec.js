import { expect, test } from '@playwright/test'

async function mobileSchedule(page, width = 390) {
  await page.clock.setFixedTime(new Date('2026-09-05T17:00:00Z'))
  await page.setViewportSize({ width, height: 844 })
  await page.route('**/espn/**', (route) => route.fulfill({ json: {} }))
  const event = (id, date, state, shortDetail) => ({
    id, date, status: { type: { state, completed: state === 'post', shortDetail } },
    competitions: [{ venue: { fullName: 'Wrigley Field' }, competitors: [
      { homeAway: 'home', score: '5', team: { id: '16', shortDisplayName: 'Cubs', abbreviation: 'CHC' } },
      { homeAway: 'away', score: '3', team: { id: '20', shortDisplayName: 'Washington Nationals', abbreviation: 'WSH' } },
    ] }],
  })
  await page.route('**/espn/apis/site/v2/sports/baseball/mlb/teams/16/schedule**', (route) => route.fulfill({ json: { events: [
    event('mobile-final', '2026-09-04T18:20:00Z', 'post', 'Final'),
    event('mobile-live', '2026-09-05T18:20:00Z', 'in', 'Middle of the 12th inning'),
    event('mobile-next', '2026-09-06T18:20:00Z', 'pre', '9/6 - 2:20 PM EDT'),
  ] } }))
  await page.goto('/?team=cubs&season=2026&tab=schedule')
  await expect(page.locator('.game')).toHaveCount(3)
  await page.evaluate(() => document.fonts.ready)
}

for (const width of [320, 390]) {
  test(`mobile schedule keeps full opponent names readable at ${width}px`, async ({ page }) => {
    await mobileSchedule(page, width)
    const sizes = await page.locator('.g-opp .name').evaluateAll((names) => names.map((name) => ({
      width: name.clientWidth, scrollWidth: name.scrollWidth,
    })))
    expect(sizes.every((size) => size.width >= 130 && size.scrollWidth <= size.width + 1)).toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
    const results = await page.locator('.g-result').evaluateAll((cells) => cells.map((cell) => {
      const rect = cell.getBoundingClientRect()
      return [...cell.children].every((child) => { const box = child.getBoundingClientRect(); return box.left >= rect.left - 1 && box.right <= rect.right + 1 })
    }))
    expect(results.every(Boolean)).toBe(true)
  })
}

test('mobile schedule row actions and month controls have comfortable hit areas', async ({ page }) => {
  await mobileSchedule(page)
  const targets = await page.locator('button.g-toggle, .calendar-button, .month-toggle').evaluateAll((buttons) => buttons.map((button) => {
    const { width, height } = button.getBoundingClientRect()
    return { width, height }
  }))
  expect(targets.length).toBeGreaterThan(2)
  expect(targets.every(({ width, height }) => width >= 44 && height >= 44)).toBe(true)
})
