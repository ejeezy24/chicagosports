import { videoLinks } from '../videos.js'
import '../video-links.css'

export function VideoLinks({ team, game, moment }) {
  if (game && !game.completed) return null
  return <details className="video-links">
    <summary>Watch on YouTube</summary>
    <div className="video-links-content">
      <div>{videoLinks(team, { game, moment }).map(link => <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer">{link.label} ↗</a>)}</div>
      <small>Search by matchup or moment and date. Availability varies; video titles may reveal results.</small>
    </div>
  </details>
}
