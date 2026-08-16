import { TEAMS, accentFor } from '../teams.js'
import { formatDate, formatTime } from '../format.js'

/**
 * Doubles as the nav and the "what's happening today" strip: each card carries
 * the team's live record and next game, pulled from the team endpoint.
 */
export function TeamPicker({ selected, onSelect, overview }) {
  return (
    <nav className="teams" aria-label="Chicago teams">
      {TEAMS.map((team) => {
        const info = overview?.[team.key]
        return (
          <button
            key={team.key}
            className="team-card"
            style={{ '--card-color': accentFor(team) }}
            aria-pressed={selected === team.key}
            onClick={() => onSelect(team.key)}
          >
            <div className="tc-head">
              {info?.logo ? <img src={info.logo} alt="" loading="lazy" /> : null}
              <div>
                <div className="tc-name">{team.short}</div>
                <div className="tc-league">{team.leagueLabel}</div>
              </div>
            </div>
            {/* Fall back to something stable so a failed overview fetch leaves
                a labelled card rather than an empty box. */}
            <div className="tc-meta">{info?.record ?? team.venue}</div>
            <div className="tc-next">{info?.next ?? ' '}</div>
          </button>
        )
      })}
    </nav>
  )
}

/** Pull the handful of fields the cards need out of a team payload. */
export function summarizeTeam(payload) {
  const team = payload?.team ?? {}
  const record =
    team.record?.items?.find((i) => i.type === 'total') ?? team.record?.items?.[0] ?? null

  const event = team.nextEvent?.[0]
  let next = null
  if (event) {
    const comp = event.competitions?.[0] ?? {}
    const state = comp.status?.type?.state
    const opponent = (comp.competitors ?? []).find(
      (c) => String(c.team?.id) !== String(team.id),
    )
    const us = (comp.competitors ?? []).find((c) => String(c.team?.id) === String(team.id))
    const vs = `${us?.homeAway === 'home' ? 'vs' : '@'} ${
      opponent?.team?.abbreviation ?? opponent?.team?.shortDisplayName ?? 'TBD'
    }`

    if (state === 'in') {
      // This endpoint omits the score while a game is in progress, so the
      // period is all there is to say — a bare "-" just looked broken.
      const detail = comp.status?.type?.shortDetail
      next = `LIVE ${vs}${detail ? ` · ${detail}` : ''}`
    } else {
      const when = `${formatDate(event.date)} ${formatTime(event.date)}`.trim()
      next = `${vs} · ${when}`
    }
  }

  return {
    // Drives whether the header strip keeps polling; the display string alone
    // would mean parsing text back out to know.
    live: event?.competitions?.[0]?.status?.type?.state === 'in',
    logo: team.logos?.[0]?.href ?? null,
    record: record?.summary
      ? `${isPreseasonRecord(record, event) ? 'Preseason ' : ''}${record.summary}${team.standingSummary ? ` · ${team.standingSummary}` : ''}`
      : team.standingSummary ?? null,
    next,
  }
}

function isPreseasonRecord(record, event) {
  const label = [record?.type, record?.name, record?.displayName].filter(Boolean).join(' ')
  return /preseason/i.test(label) || Number(event?.season?.type) === 1
}
