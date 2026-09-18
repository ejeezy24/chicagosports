import { readFileSync } from 'node:fs'
import { test, expect } from '@playwright/test'

const fixture = (name) => JSON.parse(readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), 'utf8').replace(/^\uFEFF/, ''))

async function feeds(page) {
  await page.clock.setFixedTime(new Date('2026-09-17T23:30:00Z'))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.route('**/espn/**', (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/schedule')) {
      return route.fulfill({ json: fixture(url.searchParams.get('season') === '2015' ? 'schedule-2015' : 'schedule-2016') })
    }
    if (url.pathname.endsWith('/summary')) {
      return route.fulfill({ json: {
        format: { regulation: { periods: 9 } },
        header: { competitions: [{ competitors: [{ homeAway: 'home', score: '4' }, { homeAway: 'away', score: '3' }] }] },
        scoringPlays: [{ scoringPlay: true, period: { number: 9, displayValue: 'Bottom 9th' }, homeScore: '4', awayScore: '3', text: 'Walk-off single' }],
      } })
    }
    return route.fulfill({ json: { events: [], team: {} } })
  })
}

test('finder filters two seasons, verifies bounded walk-offs, and protects spoiler counts', async ({ page }) => {
  await feeds(page)
  await page.setViewportSize({ width: 390, height: 900 })
  await page.goto('/?team=cubs&season=2016&tab=greatgames')
  await expect(page.getByRole('heading', { name: 'Great games finder' })).toBeVisible()

  await page.getByRole('combobox', { name: 'From' }).selectOption('2015')
  await page.getByRole('combobox', { name: 'To' }).selectOption('2016')
  await expect(page.locator('.great-games-verification strong')).toContainText('memorable game')

  await page.getByRole('combobox', { name: 'Moment' }).selectOption('close')
  await expect(page.locator('.great-game-result')).not.toHaveCount(0)
  await page.getByRole('combobox', { name: 'Moment' }).selectOption('blowout')
  await expect(page.locator('.great-game-result')).not.toHaveCount(0)
  await page.getByRole('combobox', { name: 'Moment' }).selectOption('all')
  await page.getByRole('textbox', { name: 'Matchup' }).fill('White Sox')
  await expect(page.locator('.great-game-result')).not.toHaveCount(0)

  await page.getByRole('button', { name: /Check games for walk-offs/ }).click()
  await expect(page.getByText(/of .* home wins checked/)).toBeVisible()
  await page.getByRole('combobox', { name: 'Moment' }).selectOption('walkoff')
  await expect(page.locator('.great-game-tags').first()).toContainText('walkoff')

  await page.getByRole('checkbox', { name: /Spoiler-free/ }).check()
  await expect(page.locator('.great-games-verification')).toHaveCount(0)
  await expect(page.locator('.great-game-result')).toHaveCount(0)
  await page.getByRole('button', { name: 'Reveal great-game results' }).click()
  await expect(page.locator('.great-games-verification')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})
