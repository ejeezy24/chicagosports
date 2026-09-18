const clean = (value, limit) => typeof value === 'string' ? value.trim().slice(0, limit) : ''

export function newsUrl(value) {
  try {
    const url = new URL(value)
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null
    if (url.protocol === 'http:') url.protocol = 'https:'
    return url.href
  } catch { return null }
}

/** Only provider-tagged team stories; never relabel a generic league feed. */
export function normalizeNews(payload, team) {
  const seen = new Set()
  return (Array.isArray(payload?.articles) ? payload.articles : []).flatMap(article => {
    if (!article || typeof article !== 'object') return []
    const categories = Array.isArray(article.categories) ? article.categories : []
    const relevant = categories.some(category => category?.type === 'team'
      && String(category.teamId ?? category.team?.id) === String(team.espnId)
      && (!category.description || typeof category.description === 'string' && category.description.toLowerCase() === team.name.toLowerCase()))
    if (!relevant) return []
    const title = clean(article.headline, 280)
    const url = newsUrl(article.links?.web?.href)
    if (!title || !url || seen.has(url)) return []
    seen.add(url)
    const published = Date.parse(article.published)
    return [{
      id: String(article.id ?? url), title, url,
      published: Number.isFinite(published) ? new Date(published).toISOString() : null,
      byline: clean(article.byline, 120),
      kind: clean(article.type, 40),
      image: newsUrl(article.images?.[0]?.url),
      imageAlt: clean(article.images?.[0]?.caption, 180),
    }]
  }).sort((a, b) => (Date.parse(b.published) || 0) - (Date.parse(a.published) || 0)).slice(0, 24)
}
