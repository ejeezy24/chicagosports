export function todayRows(overview, teams) {
  return teams
    .map((team, index) => {
      const info = overview?.[team.key]
      if (!info?.next) return null
      return {
        teamKey: team.key,
        team: team.short,
        status: info.live ? 'LIVE' : 'NEXT',
        detail: info.next.replace(/^LIVE\s+/, ''),
        live: Boolean(info.live),
        index,
      }
    })
    .filter(Boolean)
    .sort((a, b) => Number(b.live) - Number(a.live) || a.index - b.index)
}
