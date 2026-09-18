import { useEffect, useRef, useState } from 'react'
import { useFan } from '../FanContext.jsx'
import { gameKey } from '../fan.js'
import { drawPoster, posterBlob, downloadPoster } from '../poster.js'
import { ExperienceDialog } from './ExperienceDialog.jsx'
import '../game-experiences.css'
import '../game-poster.css'

export function GamePoster({ team, game, onClose }) {
  const fan = useFan()
  const [caption, setCaption] = useState('')
  const [includeScore, setIncludeScore] = useState(true)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const canvas = useRef(null)
  const visible = fan.visible(gameKey(team, game))
  const showScore = visible && includeScore
  useEffect(() => {
    try { drawPoster(canvas.current, team, game, caption, showScore) }
    catch (error) { setStatus(error.message) }
  }, [team, game, caption, showScore])
  const exportPoster = async share => {
    setBusy(true); setStatus('')
    try {
      const blob = await posterBlob(canvas.current)
      const filename = `chicago-${team.key}-${game.id ?? 'game'}.png`
      const file = new File([blob], filename, { type:'image/png' })
      if (share && navigator.canShare?.({ files:[file] })) { await navigator.share({ files:[file], title:`${team.short} game poster` }); setStatus('Poster shared.') }
      else { downloadPoster(blob, filename); setStatus(share ? 'Image sharing is unavailable here. Poster downloaded instead.' : 'Poster downloaded.') }
    } catch (error) { if (error.name !== 'AbortError') setStatus('Could not export this poster. Please try again.') }
    finally { setBusy(false) }
  }
  return <ExperienceDialog title="Make a game poster" team={team} onClose={onClose}>
    <div className="poster-editor"><canvas ref={canvas} role="img" aria-label={`Poster preview: ${team.short} ${game.home ? 'vs' : 'at'} ${game.opponent?.name}. ${showScore ? 'Scores included when available.' : 'Scores hidden.'}`} />
      <div className="poster-controls"><h3>Your game. Your memory.</h3><label>Caption<textarea rows="3" maxLength="120" value={caption} onChange={event => setCaption(event.target.value)} placeholder="A night to remember…" /></label><small>{caption.length}/120 characters</small>
        <label className="poster-check"><input type="checkbox" checked={includeScore && visible} disabled={!visible} onChange={event => setIncludeScore(event.target.checked)} />Include score</label>
        {!visible ? <p>Scores are hidden by your spoiler-free setting.</p> : null}
        <button disabled={busy} onClick={() => exportPoster(false)}>Download PNG</button><button disabled={busy} onClick={() => exportPoster(true)}>Share image</button>
        <p className="poster-hint">1080 × 1350 · No account required. Your caption stays in this browser until you download or share.</p><p role="status">{status}</p>
      </div>
    </div>
  </ExperienceDialog>
}
