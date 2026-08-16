import { useState } from 'react'
import { seasonLabel } from '../seasons.js'

const normalizeName = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

export function samePlayer(a, b) {
  if (!a || !b) return false
  if (a.id != null && b.id != null && String(a.id) === String(b.id)) return true
  return normalizeName(a.name) === normalizeName(b.name)
}

export function findPlayerBio(groups, player) {
  return (groups ?? []).flatMap((group) => group.athletes ?? []).find((athlete) => samePlayer(athlete, player)) ?? null
}

export function playerStatLines(groups, player) {
  return (groups ?? []).flatMap((group) => {
    const row = (group.rows ?? []).find((candidate) => samePlayer(candidate, player))
    if (!row) return []
    return [{
      name: group.name,
      stats: (group.columns ?? []).map((label, index) => ({ label, value: row.values?.[index] ?? '—' })),
    }]
  })
}

const initials = (name) =>
  String(name ?? '')
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase() || 'CS'

export function PlayerProfile({ team, season, player, bio, groups, career = [], onClose }) {
  const [showCareer, setShowCareer] = useState(false)
  const lines = playerStatLines(groups, player)
  const details = [
    bio?.positionName ?? bio?.position ?? player.position,
    bio?.height,
    bio?.weight,
    bio?.age ? `${bio.age} years old` : null,
    bio?.college,
    bio?.birthplace,
  ].filter(Boolean)

  return (
    <article className="player-profile" aria-label={`${player.name} season profile`}>
      <div className="profile-stripe">Chicago Sports player file · {seasonLabel(team, season)}</div>
      <div className="profile-head">
        <div className="profile-portrait">
          {bio?.headshot ? <img src={bio.headshot} alt="" /> : <span>{initials(player.name)}</span>}
        </div>
        <div className="profile-title">
          <span>{team.name} · {team.leagueLabel}</span>
          <h3>{player.name}</h3>
          <p>
            {bio?.jersey || player.jersey ? <strong>#{bio?.jersey ?? player.jersey}</strong> : null}
            {details.length ? ` ${details.join(' · ')}` : ` ${player.position ?? 'Player'}`}
          </p>
        </div>
        <button className="profile-close" onClick={onClose} aria-label={`Close ${player.name} profile`}>×</button>
      </div>

      {lines.length ? (
        <div className="profile-groups">
          {lines.map((line) => (
            <section key={line.name}>
              <h4>{line.name}</h4>
              <dl>
                {line.stats.map((stat, index) => (
                  <div key={`${stat.label}-${index}`}>
                    <dt>{stat.label}</dt>
                    <dd>{stat.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      ) : (
        <p className="profile-empty">This verified roster entry has no individual stat line in the season feed.</p>
      )}

      <section className="career-file" aria-label={`${player.name} verified Chicago career file`}>
        <button
          className="career-toggle"
          aria-expanded={showCareer}
          onClick={() => setShowCareer((value) => !value)}
        >
          {showCareer ? 'Hide career file' : 'Open career file'} · {career.length} verified {career.length === 1 ? 'season' : 'seasons'}
        </button>
        {showCareer ? (
          career.length ? (
            <div className="career-seasons">
              <p>Coverage reflects saved, verified season files—not a claim of complete franchise service.</p>
              {career.map((entry) => (
                <article key={entry.season}>
                  <h4>{entry.label}</h4>
                  {entry.lines.map((line) => (
                    <div key={line.name}>
                      <strong>{line.name}</strong>
                      <dl>
                        {line.columns.map((column, index) => (
                          <div key={`${column}-${index}`}><dt>{column}</dt><dd>{line.values[index]}</dd></div>
                        ))}
                      </dl>
                    </div>
                  ))}
                </article>
              ))}
            </div>
          ) : <p className="profile-empty">No saved career seasons are available for this player yet.</p>
        ) : null}
      </section>
    </article>
  )
}
