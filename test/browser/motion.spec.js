import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'

const fixture = name => JSON.parse(readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), 'utf8'))

async function prepare(page, { reducedMotion = 'no-preference', animationApi = true } = {}) {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion })
  await page.clock.setFixedTime(new Date('2026-09-17T23:30:00Z'))
  await page.addInitScript(({ animationApi }) => {
    window.motionRuns = []
    const animate = Element.prototype.animate
    Element.prototype.animate = animationApi ? function (...args) {
      const animation = animate.apply(this, args)
      window.motionRuns.push({ animation, element: this })
      return animation
    } : undefined
  }, { animationApi })
  await page.route('**/espn/**', route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/schedule')) return route.fulfill({ json: fixture('schedule-2016') })
    if (url.pathname.endsWith('/summary')) return route.fulfill({ json: fixture('summary') })
    if (url.pathname.endsWith('/baseball/mlb/scoreboard')) return route.fulfill({ json: fixture('today') })
    return route.fulfill({ json: {} })
  })
  await page.goto('/?team=cubs&season=2016&tab=schedule')
  await expect(page.locator('.game').first()).toBeVisible()
}

const runCount = (page, id) => page.evaluate(id => window.motionRuns.filter(run => run.animation.id === id).length, id)

test('clicks, keyboard selection, and details animate without delaying controls', async ({ page }) => {
  await prepare(page)
  const finder = page.getByRole('tab', { name: 'Game finder' })
  await finder.click()
  await expect(finder).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('heading', { name: 'Great games finder' })).toBeVisible()
  await expect.poll(() => runCount(page, 'cs-press')).toBeGreaterThan(0)
  await expect.poll(() => runCount(page, 'cs-panel')).toBeGreaterThan(0)

  const presses = await runCount(page, 'cs-press')
  await finder.focus()
  await finder.press('Enter')
  await expect.poll(() => runCount(page, 'cs-press')).toBeGreaterThan(presses)

  await page.getByRole('tab', { name: 'Schedule & scores' }).click()
  await page.locator('.g-toggle').first().click()
  await expect(page.locator('.game-detail-reveal')).toBeVisible()
  await expect(page.locator('.live-scoreboard')).toBeVisible()
  expect(await page.locator('.game-detail-reveal').evaluate(el => getComputedStyle(el).animationName)).not.toBe('none')
  const disclosure = page.locator('.schedule-tools-disclosure')
  await disclosure.locator(':scope > summary').click()
  await expect(disclosure).toHaveAttribute('open', '')
  await expect(page.getByRole('combobox', { name: /^Opponent/ })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
})

test('rapid repeated clicks keep one feedback animation and navigation survives history', async ({ page }) => {
  await prepare(page)
  const scores = page.getByRole('tab', { name: 'Schedule & scores' })
  const active = await scores.evaluate(button => {
    button.click()
    button.click()
    button.click()
    return button.getAnimations().filter(animation => animation.id === 'cs-press' && animation.playState !== 'idle').length
  })
  expect(active).toBe(1)
  await scores.focus()
  await scores.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'Game finder' })).toHaveAttribute('aria-selected', 'true')
  await page.goBack()
  await expect(scores).toHaveAttribute('aria-selected', 'true')
  await page.goForward()
  await expect(page.getByRole('tab', { name: 'Game finder' })).toHaveAttribute('aria-selected', 'true')
})

test('reduced motion cancels active feedback and future interactions remain immediate', async ({ page }) => {
  await prepare(page)
  await page.getByRole('tab', { name: 'Schedule & scores' }).evaluate(button => {
    button.click()
    button.getAnimations().forEach(animation => animation.pause())
  })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect.poll(() => page.evaluate(() => window.motionRuns.every(({ animation }) => animation.playState === 'idle' || animation.playState === 'finished'))).toBe(true)
  const runs = await page.evaluate(() => window.motionRuns.length)
  await page.getByRole('tab', { name: 'Game finder' }).click()
  await expect(page.getByRole('heading', { name: 'Great games finder' })).toBeVisible()
  expect(await page.evaluate(() => window.motionRuns.length)).toBe(runs)
  await page.getByRole('tab', { name: 'Schedule & scores' }).click()
  await page.locator('.g-toggle').first().click()
  await expect(page.locator('.live-scoreboard')).toBeVisible()
  await expect(page.locator('.game-detail-reveal')).toHaveCSS('animation-name', 'none')
})

test('animation API fallback preserves navigation and native disclosures', async ({ page }) => {
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await prepare(page, { animationApi: false })
  await page.getByRole('tab', { name: 'Game finder' }).click()
  await expect(page.getByRole('heading', { name: 'Great games finder' })).toBeVisible()
  await page.locator('.club-details > summary').click()
  await expect(page.getByRole('checkbox', { name: /Explore back/ })).toBeVisible()
  expect(errors).toEqual([])
})

test('refreshing data does not replay panel navigation motion', async ({ page }) => {
  await prepare(page)
  await page.getByRole('tab', { name: 'Playoff race' }).click()
  await expect(page.locator('.race-tools')).toBeVisible()
  const count = await runCount(page, 'cs-panel')
  const refreshed = page.waitForResponse(response => response.url().includes('/standings'))
  await page.locator('.race-tools').getByRole('button', { name: 'Refresh' }).click()
  await refreshed
  await expect(page.locator('.race-tools')).toBeVisible()
  expect(await runCount(page, 'cs-panel')).toBe(count)
})

test('stadium popovers stay inside the viewport while a panel is moving', async ({ page }) => {
  await prepare(page)
  await page.locator('.club-details > summary').click()
  await page.locator('.team-dashboard').evaluate(panel => {
    const animation = panel.animate([{ translate: '0 12px' }, { translate: 'none' }], { duration: 280 })
    animation.currentTime = 120
    animation.pause()
  })
  const venue = page.locator('.club-details').getByRole('button', { name: /Wrigley Field.*stadium details/ })
  await venue.focus()
  const popover = page.getByRole('tooltip')
  await expect(popover).toBeVisible()
  const contained = await popover.evaluate(el => {
    const box = el.getBoundingClientRect()
    return el.parentElement === document.body && box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight
  })
  expect(contained).toBe(true)
  await page.keyboard.press('Escape')
  await expect(popover).toHaveCount(0)
})

test.describe('touch feedback', () => {
  test.use({ hasTouch: true, isMobile: true })
  test('phone taps animate selection and open the requested view', async ({ page }) => {
    await prepare(page)
    await page.getByRole('tab', { name: 'Game finder' }).tap()
    await expect(page.getByRole('heading', { name: 'Great games finder' })).toBeVisible()
    await expect.poll(() => runCount(page, 'cs-press')).toBeGreaterThan(0)
    await expect.poll(() => runCount(page, 'cs-panel')).toBeGreaterThan(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  })
})
