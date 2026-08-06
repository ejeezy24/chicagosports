const REFERENCE_TEAMS = {
  cubs: { host: 'baseball-reference.com', code: 'CHC', ext: 'shtml' },
  whitesox: { host: 'baseball-reference.com', code: 'CHW', ext: 'shtml' },
  bears: { host: 'pro-football-reference.com', code: 'chi', ext: 'htm' },
  bulls: { host: 'basketball-reference.com', code: 'CHI', ext: 'html' },
  blackhawks: { host: 'hockey-reference.com', code: 'CHI', ext: 'html' },
}

/** A human-facing season page only; Sports Reference is never scraped by the app. */
export function sportsReference(team, season) {
  const source = REFERENCE_TEAMS[team.key]
  if (!source) return null
  return {
    label: source.host.replace(/^www\./, ''),
    url: `https://www.${source.host}/teams/${source.code}/${season}.${source.ext}`,
  }
}
