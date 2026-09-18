import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { TEAMS } from '../../src/teams.js'
const fixture = name => JSON.parse(readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), 'utf8'))
async function feeds(page) {
  await page.clock.setFixedTime(new Date('2026-09-17T23:30:00Z'))
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.route('**/espn/**', route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/schedule')) return route.fulfill({ json: fixture('schedule-2016') })
    if (url.pathname.endsWith('/summary')) return route.fulfill({ json: fixture('summary') })
    if (url.pathname.endsWith('/baseball/mlb/scoreboard')) return route.fulfill({ json: fixture('today') })
    const team = TEAMS.find(t => url.pathname.endsWith(`/teams/${t.espnId}`) && url.pathname.includes(`/${t.league}/`))
    if (team) return route.fulfill({ json: { team: { id: team.espnId, record: { items: [{ type: 'total', summary: '85-68' }] }, standingSummary: '2nd in the division', nextEvent: [{ date: '2026-09-18T23:40:00Z', competitions: [{ status: { type: { state: 'pre' } }, competitors: [{ homeAway: 'home', team: { id: team.espnId } }, { homeAway: 'away', team: { id: '999', abbreviation: 'OPP' } }] }] }] } } })
    return route.fulfill({ json: {} })
  })
}
for (const [width, mainLimit, gameLimit] of [[1440, 450, 750], [390, 600, 950], [320, 650, 1050]]) {
  test(`compact layout reaches the games and keeps controls readable at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 })
    await feeds(page)
    await page.goto('/?team=cubs&season=2016&tab=schedule')
    await expect(page.locator('.game').first()).toBeVisible()
    await expect(page.locator('.today-games button').first()).toBeVisible()
    await page.evaluate(() => document.fonts.ready)
    const dimensions = await page.evaluate(() => ({
      main: document.querySelector('main').getBoundingClientRect().top + scrollY,
      game: document.querySelector('.game').getBoundingClientRect().top + scrollY,
      width: document.documentElement.scrollWidth,
      nav: document.querySelector('[role=tablist]').getBoundingClientRect().height,
      bodyFont: getComputedStyle(document.body).fontFamily,
    }))
    expect(Math.round(dimensions.main)).toBeLessThanOrEqual(mainLimit)
    expect(Math.round(dimensions.game)).toBeLessThanOrEqual(gameLimit)
    expect(dimensions.width).toBe(width)
    expect(dimensions.nav).toBeLessThan(75)
    expect(dimensions.bodyFont).toContain('Segoe UI')
    await expect(page.getByRole('tab')).toHaveCount(13)
    const scoresFit = await page.locator('.today-games button').evaluateAll(cards => cards.every(card => {
      const bounds = card.getBoundingClientRect()
      return [...card.children].every(child => { const box = child.getBoundingClientRect(); return box.top >= bounds.top && box.bottom <= bounds.bottom })
    }))
    expect(scoresFit).toBe(true)
    await expect(page.locator('.schedule-tools-disclosure')).not.toHaveAttribute('open', '')
    await page.locator('.schedule-tools-disclosure > summary').click()
    await page.getByRole('combobox', { name: /^Opponent/ }).selectOption('4')
    await expect(page.locator('.schedule-tools-disclosure > summary')).toContainText('1 active')
    await expect(page.locator('.g-opp .name').first()).toContainText('White Sox')
    await page.getByRole('button', { name: 'Clear filters' }).click()
    await page.locator('.schedule-tools-disclosure > summary').click()
    await page.locator('.club-details > summary').click()
    await expect(page.getByRole('checkbox', { name: /Explore back/ })).toBeVisible()
    const detailsFit = await page.locator('.team-dashboard').evaluate(dashboard => {
      const bottom = dashboard.getBoundingClientRect().bottom
      return [...dashboard.querySelectorAll('.club-details > *')].every(child => child.getBoundingClientRect().bottom <= bottom)
        && bottom <= document.querySelector('.tabs').getBoundingClientRect().top
    })
    expect(detailsFit).toBe(true)
    await page.locator('.club-details > summary').click()
    await page.screenshot({ path: testInfo.outputPath(`layout-${width}.png`) })
  })
}
test('horizontal view navigation supports keyboard and restores selected tabs', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await feeds(page)
  await page.goto('/?team=cubs&season=2016&tab=schedule')
  const scores = page.getByRole('tab', { name: 'Schedule & scores' })
  await scores.focus()
  await scores.press('End')
  const standings = page.getByRole('tab', { name: 'Standings', exact: true })
  await expect(standings).toBeFocused()
  await expect(standings).toHaveAttribute('aria-selected', 'true')
  const inStrip = () => standings.evaluate(el => { const tab = el.getBoundingClientRect(); const strip = el.parentElement.getBoundingClientRect(); return tab.left >= strip.left - 1 && tab.right <= strip.right + 1 })
  await expect.poll(inStrip).toBe(true)
  await page.goBack()
  await expect(scores).toHaveAttribute('aria-selected', 'true')
  await page.goForward()
  await expect(standings).toHaveAttribute('aria-selected', 'true')
  await expect.poll(inStrip).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
})
