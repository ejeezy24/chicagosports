const videoDate = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Chicago', month: 'long', day: 'numeric', year: 'numeric',
})

function searchDate(value) {
  if (typeof value !== 'string' || !value) return ''
  // Archive milestones are calendar dates, not midnight UTC timestamps.
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00Z` : value)
  return Number.isNaN(date.getTime()) ? '' : videoDate.format(date)
}

function youtubeSearch(query) {
  const url = new URL('https://www.youtube.com/results')
  url.searchParams.set('search_query', query.filter(Boolean).join(' '))
  return url.href
}

// Official MLB Vault upload, verified against the publisher's video listing.
const CLASSICS = {
  'whitesox:2005-10-26': {
    label: 'Watch 2005 World Series Game 4 · MLB Vault',
    href: 'https://www.youtube.com/watch?v=HaAsMEN7qbA',
  },
}

export function videoLinks(team, { game, moment } = {}) {
  const query = game
    ? [team.name, game.opponent?.name ? `vs ${game.opponent.name}` : '', searchDate(game.date)]
    : [team.name, moment?.title, searchDate(moment?.date)]
  const links = [{ label: 'Find highlights', href: youtubeSearch([...query, 'highlights']) }]
  const classic = game ? null : CLASSICS[`${team.key}:${moment?.date}`]
  links.push(classic ?? { label: 'Find full game', href: youtubeSearch([...query, 'full game']) })
  return links
}
