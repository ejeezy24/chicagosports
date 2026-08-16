import { currentSeasonFor, seasonIsComplete } from '../src/seasons.js'
import { TEAMS } from '../src/teams.js'
import { importSeason, rebuildIndex } from './archive-lib.mjs'

const args = process.argv.slice(2)
const value = (name) => args[args.indexOf(name) + 1]
const latestComplete = (team, now = new Date()) => {
  let season = currentSeasonFor(team, now)
  while (!seasonIsComplete(team, season, now)) season -= 1
  return season
}

if (!args.includes('--all') && !args.includes('--team')) throw new Error('Use --team TEAM or --all')
const requestedTeam = value('--team')
const selectedTeam = TEAMS.find((team) => team.key === requestedTeam)
if (!args.includes('--all') && !selectedTeam) throw new Error(`Unknown team: ${requestedTeam}`)
const teams = args.includes('--all') ? TEAMS : [selectedTeam]

const failures = []
for (const team of teams) {
  const season = args.includes('--latest-completed') ? latestComplete(team) : Number(value('--season'))
  if (!Number.isInteger(season)) throw new Error('Use --season YYYY or --latest-completed')
  try {
    const { snapshot, unchanged } = await importSeason(team, season)
    console.log(`${unchanged ? 'Checked' : 'Imported'} ${team.key} ${snapshot.label}: roster ${snapshot.coverage.roster}, players ${snapshot.coverage.players}`)
  } catch (error) {
    failures.push(String(error?.message ?? error))
    console.error(`Failed ${team.key} ${season}:`, error?.message ?? error)
  }
}

const entries = await rebuildIndex()
console.log(`Archive index: ${entries.length} season files`)
if (failures.length) process.exitCode = 1
