import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { TEAMS, teamByKey } from '../src/teams.js'
import { ARCHIVE_DIR, rebuildIndex, validateSnapshot } from './archive-lib.mjs'

const entries = await rebuildIndex()
const errors = []
for (const entry of entries) {
  const team = teamByKey(entry.team)
  if (!TEAMS.some((candidate) => candidate.key === entry.team)) {
    errors.push(`${entry.team} ${entry.season}: unknown team`)
    continue
  }
  const snapshot = JSON.parse(await readFile(join(ARCHIVE_DIR, entry.team, `${entry.season}.json`), 'utf8'))
  errors.push(...validateSnapshot(snapshot, team).map((error) => `${entry.team} ${entry.season}: ${error}`))
}
if (errors.length) {
  console.error(errors.join('\n'))
  process.exitCode = 1
} else console.log(`Validated ${entries.length} archive season files`)
