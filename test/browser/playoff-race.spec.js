import { test, expect } from '@playwright/test'
import fs from 'node:fs'

const mlb = JSON.parse(fs.readFileSync(new URL('../fixtures/race-mlb.json', import.meta.url)))
const conference = JSON.parse(fs.readFileSync(new URL('../fixtures/race-mlb-level2.json', import.meta.url)))
const schedule = { season: { year: 2026 }, events: [{ id: 'remaining', date: '2026-09-25T23:00:00Z', competitions: [{ competitors: [{ homeAway: 'home', team: { id: '16', displayName: 'Cubs' } }, { homeAway: 'away', team: { id: '4', displayName: 'White Sox' } }], status: { type: { state: 'pre' } } }] }] }

async function mockRace(page, { partial = false } = {}) {
  await page.route('**/espn/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.includes('/standings')) {
      if (partial && url.searchParams.get('level') === '2') return route.fulfill({ status: 503, json: { error: 'temporary' } })
      return route.fulfill({ json: url.searchParams.get('level') === '2' ? conference : mlb })
    }
    if (url.pathname.includes('/schedule')) return route.fulfill({ json: schedule })
    return route.fulfill({ json: {} })
  })
  await page.route('https://site.api.espn.com/**', (route) => route.abort())
}

test('current playoff race renders standings, remaining games, and spoilers on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => localStorage.setItem('cs.fan.v1', JSON.stringify({ version: 1, spoiler: true, tickets: {}, answers: {} })))
  await mockRace(page)
  await page.goto('/?team=cubs&season=2026&tab=playoffrace')
  await expect(page.getByText('Results hidden · spoiler-free mode')).toBeVisible()
  await page.getByRole('button', { name: 'Reveal playoff race' }).click()
  await expect(page.getByRole('heading', { name: 'Scheduled games remaining' })).toBeVisible()
  await expect(page.locator('.playoff-race > .race-group').first().getByText('Clinched Division', { exact: true })).toBeVisible()
  await expect(page.locator('.table-wrap').first()).toHaveCSS('overflow-x', /auto|scroll/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
})

test('historical and partial race states remain honest', async ({ page }) => {
  await mockRace(page, { partial: true })
  await page.goto('/?team=cubs&season=2025&tab=playoffrace')
  await expect(page.getByText('Conference standings unavailable.')).toBeVisible()
  await expect(page.getByText('Historical season snapshot.')).toBeVisible()
  await expect(page.getByText('Seeds are ESPN’s published positions', { exact: false })).toBeVisible()
})
