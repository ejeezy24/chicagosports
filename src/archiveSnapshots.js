const SCHEMA_VERSION = 1

const cache = new Map()
let indexPending = null

export const archiveSnapshotUrl = (team, season) =>
  `/data/archive/${team.key}/${Number(season)}.json`

export function validateArchiveSnapshot(snapshot, team, season) {
  if (!snapshot || snapshot.schemaVersion !== SCHEMA_VERSION) return false
  if (snapshot.team !== team.key || Number(snapshot.season) !== Number(season)) return false
  if (!snapshot.roster || !snapshot.players || !snapshot.coverage) return false
  return ['complete', 'unavailable'].includes(snapshot.coverage.roster)
    && ['complete', 'unavailable'].includes(snapshot.coverage.players)
}

export async function loadArchiveSnapshot(team, season, fetcher = fetch) {
  const key = `${team.key}:${Number(season)}`
  if (fetcher === fetch && cache.has(key)) return cache.get(key)

  const pending = (async () => {
    const response = await fetcher(archiveSnapshotUrl(team, season), {
      headers: { Accept: 'application/json' },
    })
    if (response.status === 404) return null
    if (!response.ok) throw new Error(`Archive snapshot responded ${response.status}`)
    const snapshot = await response.json()
    return validateArchiveSnapshot(snapshot, team, season) ? snapshot : null
  })()

  if (fetcher === fetch) {
    cache.set(key, pending)
    pending.catch(() => cache.delete(key))
  }
  return pending
}

export async function archiveFirst(team, season, kind, fallback, fetcher = fetch) {
  try {
    const snapshot = await loadArchiveSnapshot(team, season, fetcher)
    if (snapshot?.coverage?.[kind] === 'complete' && snapshot[kind]) {
      return {
        ...snapshot[kind],
        archiveSnapshot: {
          importedAt: snapshot.importedAt,
          source: snapshot.sources?.[kind] ?? 'Saved season archive',
        },
      }
    }
  } catch {
    // A saved copy is an optimization, not a single point of failure.
  }
  return fallback()
}

export async function loadArchiveIndex(fetcher = fetch) {
  if (fetcher === fetch && indexPending) return indexPending
  const pending = (async () => {
    const response = await fetcher('/data/archive/index.json', { headers: { Accept: 'application/json' } })
    if (!response.ok) throw new Error(`Archive index responded ${response.status}`)
    const payload = await response.json()
    return payload?.schemaVersion === SCHEMA_VERSION && Array.isArray(payload.seasons)
      ? payload.seasons
      : []
  })()
  if (fetcher === fetch) {
    indexPending = pending
    pending.catch(() => { indexPending = null })
  }
  return pending
}

export async function loadTeamArchiveSnapshots(team, fetcher = fetch) {
  const index = await loadArchiveIndex(fetcher)
  const entries = index.filter((entry) => entry.team === team.key && entry.coverage?.players === 'complete')
  const snapshots = await Promise.all(entries.map((entry) => loadArchiveSnapshot(team, entry.season, fetcher)))
  return snapshots.filter(Boolean).sort((a, b) => b.season - a.season)
}

export { SCHEMA_VERSION }
