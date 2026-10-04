import { useState } from 'react'

export function ClubLogo({ src, abbreviation }) {
  const [loaded, setLoaded] = useState(null)
  const [failed, setFailed] = useState(null)
  const ready = Boolean(src && loaded === src && failed !== src)
  return <span className="club-logo" data-ready={ready} aria-hidden="true">
    <span>{abbreviation}</span>
    {src && failed !== src ? <img src={src} alt="" onLoad={() => setLoaded(src)} onError={() => setFailed(src)} /> : null}
  </span>
}
