import { getSchedule, getSummary } from './api.js'
import { scheduleEvents } from './espn.js'

const REGULATION = { football: 4, basketball: 4, hockey: 3, baseball: 9 }
const CLOSE = { football: 8, basketball: 5, hockey: 1, baseball: 1 }
const BLOWOUT = { football: 21, basketball: 20, hockey: 4, baseball: 8 }

const number = (value) => {
  if (value === null || value === undefined || String(value).trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function sourceFor(payload, id) {
  const events = Array.isArray(payload?.events) ? payload.events : []
  return events.find((event) => String(event.id) === String(id)) ?? null
}

function sourceText(source) {
  const comp = source?.competitions?.[0] ?? {}
  const type = comp.status?.type ?? source?.status?.type ?? {}
  return [type.name, type.description, type.detail, type.shortDetail, ...((comp.notes ?? []).map((n) => n.headline)), ...((source?.notes ?? []).map((n) => n.headline))]
    .filter(Boolean).join(' ')
}

/** Attach source evidence without changing the shared ESPN normalizer or raw payload. */
export function finderGames(payload, team) {
  return scheduleEvents(payload, team.espnId).map((game) => {
    const source = sourceFor(payload, game.id)
    const comp = source?.competitions?.[0] ?? {}
    const status = comp.status ?? source?.status ?? {}
    const type = status.type ?? {}
    return {
      ...game,
      _finderMeta: {
        period: number(status.period ?? type.period),
        regulation: number(source?.format?.regulation?.periods ?? comp.format?.regulation?.periods),
        text: sourceText(source),
        source,
      },
    }
  })
}

/** Classify only evidence that the feed can support; no one-run walk-off guesses. */
export function classifyGame(game, team, raw = game?._finderMeta) {
  if (!game?.completed || /cancel|postpon|suspend|abandon/i.test(game.detail ?? '') || !['W', 'L'].includes(game.result) || number(game.ourScore) === null || number(game.theirScore) === null) return []
  const sport = team?.sport ?? game.sport
  const ours = number(game.ourScore)
  const theirs = number(game.theirScore)
  const margin = Math.abs(ours - theirs)
  const labels = []
  if (margin === 0) return labels
  if (margin <= (CLOSE[sport] ?? 0)) labels.push('close')
  if (margin >= (BLOWOUT[sport] ?? Number.POSITIVE_INFINITY)) labels.push('blowout')
  if (sport !== 'basketball' && ((ours === 0 && theirs > 0) || (theirs === 0 && ours > 0))) labels.push('shutout')

  const regulation = number(raw?.regulation) ?? REGULATION[sport]
  const period = number(raw?.period)
  const text = String(raw?.text ?? raw?.detail ?? game.detail ?? '')
  const explicitExtra = /(?:overtime|extra innings|shootout|\b(?:\d+)?OT\b|\bSO\b)/i.test(text)
  if ((period !== null && regulation && period > regulation) || (explicitExtra && (sport !== 'baseball' || /extra innings|\b(?:OT|overtime)\b/i.test(text)))) labels.push('extra')
  if (sport === 'baseball' && raw?.walkoffVerified === true) labels.push('walkoff')
  return labels
}

const summaryValues = (payload) => {
  const header = payload?.header ?? payload?.game ?? {}
  const comp = header.competitions?.[0] ?? {}
  const competitors = comp.competitors ?? []
  const home = competitors.find((entry) => entry.homeAway === 'home')
  const away = competitors.find((entry) => entry.homeAway === 'away')
  return { home: number(home?.score), away: number(away?.score), competitors, header }
}

const playText = (play) => [play?.text, play?.shortText, play?.description, play?.type?.text].filter(Boolean).join(' ')
const playPeriod = (play) => number(play?.period?.number ?? play?.period?.value ?? play?.inning ?? play?.period)
const isBottom = (play) => {
  const value = [play?.half, play?.inningHalf, play?.period?.half, play?.period?.displayValue, play?.period?.type]
    .filter(Boolean).join(' ')
  return /bottom|bot\.?\b|home half/i.test(value)
}

/** Return yes/no/unknown; missing play evidence is deliberately not treated as no. */
export function walkoffEvidence(payload, game, team) {
  if (team?.sport !== 'baseball' || !game?.home || !game.completed || game.result !== 'W') return 'no'
  const { home: finalHome, away: finalAway } = summaryValues(payload)
  if (finalHome === null || finalAway === null) return 'unknown'
  if (finalHome <= finalAway) return 'no'
  const competition = payload?.header?.competitions?.[0] ?? {}
  const status = competition.status?.type ?? {}
  if (status.state && status.state !== 'post' && status.completed !== true) return 'unknown'
  const homeTeam = competition.competitors?.find(row => row.homeAway === 'home')?.team?.id
  if (homeTeam && team.espnId && String(homeTeam) !== String(team.espnId)) return 'unknown'
  const statusText = [status.description, status.detail, status.shortDetail].filter(Boolean).join(' ')
  const direct = Array.isArray(payload?.plays) ? payload.plays : []
  const canonical = direct.filter(play => play?.type?.type === 'play-result')
  const rows = canonical.length ? canonical : (Array.isArray(payload?.scoringPlays) ? payload.scoringPlays : direct.filter(play => play.scoringPlay))
  const last = rows.at(-1)
  // Only event status or the final meaningful play can explicitly identify a walk-off.
  if (/walk[- ]?off/i.test(statusText) || /walk[- ]?off/i.test(playText(last))) return 'yes'
  const regulation = number(payload?.format?.regulation?.periods ?? payload?.header?.format?.regulation?.periods)
  if (regulation === null || !canonical.length || !last) return 'unknown'
  if (!last.scoringPlay || !isBottom(last) || (playPeriod(last) ?? 0) < regulation) return 'no'
  const score = play => ({ home: number(play.homeScore ?? play.score?.home), away: number(play.awayScore ?? play.score?.away) })
  const ending = score(last)
  if (ending.home !== finalHome || ending.away !== finalAway) return 'unknown'
  const previous = [...canonical.slice(0, -1)].reverse().map(score).find(row => row.home !== null && row.away !== null)
  if (!previous) return 'unknown'
  // A tied game is the usual walk-off scenario; an already-leading home side is not.
  return previous.home <= previous.away && ending.home > previous.home ? 'yes' : 'no'
}

/** Verify one bounded batch of home-win candidates; callers decide when to fetch the next batch. */
export async function verifyWalkoffCandidates(team, candidates, { getSummaryImpl = getSummary, batchSize = 12 } = {}) {
  const batch = candidates.filter((game) => game.home && game.result === 'W').slice(0, batchSize)
  const verified = []
  const unknown = []
  const failures = []
  let next = 0
  async function worker() {
    while (next < batch.length) {
      const game = batch[next++]
      try {
        const evidence = walkoffEvidence(await getSummaryImpl(team, game.id), game, team)
        if (evidence === 'yes') verified.push(game.id)
        else if (evidence === 'unknown') unknown.push(game.id)
      } catch (error) { failures.push({ id: game.id, error }) }
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, batch.length) }, worker))
  return { verified, unknown, failures, checked: batch.length, remaining: Math.max(0, candidates.filter((game) => game.home && game.result === 'W').length - batch.length) }
}

export function isFinderGame(game, team, category = 'all', query = '') {
  const labels = classifyGame(game, team)
  if (category !== 'all' && !labels.includes(category)) return false
  const needle = String(query).trim().toLocaleLowerCase()
  if (needle && !`${game.opponent?.name ?? ''} ${game.opponent?.fullName ?? ''} ${game.opponent?.abbr ?? ''}`.toLocaleLowerCase().includes(needle)) return false
  return labels.length > 0
}

export function sortFinderGames(games, sort = 'newest') {
  return [...games].sort((a, b) => {
    if (sort === 'tight') {
      const marginA = Math.abs(number(a.ourScore) - number(a.theirScore))
      const marginB = Math.abs(number(b.ourScore) - number(b.theirScore))
      return marginA - marginB || new Date(b.date) - new Date(a.date)
    }
    return new Date(b.date ?? 0) - new Date(a.date ?? 0)
  })
}

/** Fetch selected seasons with at most three in-flight schedule requests. */
export async function loadFinderSchedules(team, seasons, { fresh = false, getScheduleImpl = getSchedule } = {}) {
  const requested = [...new Set((seasons ?? []).map(Number).filter(Number.isFinite))]
  const games = []
  const failures = []
  let next = 0
  async function worker() {
    while (next < requested.length) {
      const index = next++
      const season = requested[index]
      try {
        const payload = await getScheduleImpl(team, season, 2, { fresh })
        const normalized = finderGames(payload, team)
        const returnedSeason = number(payload?.season?.year ?? payload?.season?.value)
        // ESPN's schedule header can say the current year while each event is
        // correctly scoped to the requested archive season. Event years win.
        const eventSeasons = normalized.map((game) => number(game.season)).filter((year) => year !== null)
        if (eventSeasons.some((year) => year !== season) || (!eventSeasons.length && returnedSeason !== null && returnedSeason !== season)) {
          throw new Error(`Schedule returned games from another season for ${season}`)
        }
        const valid = normalized.filter((game) => game.completed && number(game.ourScore) !== null && number(game.theirScore) !== null)
        if (valid.some((game) => game.season !== null && game.season !== season)) throw new Error(`Schedule contains games from another season (${season})`)
        games.push(...valid)
      } catch (error) {
        failures.push({ season, error })
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, requested.length) }, worker))
  return { games: sortFinderGames(games), failures, requested, loaded: requested.filter((season) => !failures.some((failure) => failure.season === season)) }
}
