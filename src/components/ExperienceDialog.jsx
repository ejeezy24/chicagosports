import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'

export function ExperienceDialog({ title, team, onClose, children, fullscreen = false }) {
  const ref = useRef(null)
  const titleId = useId()
  useEffect(() => {
    const previous = document.activeElement
    const dialog = ref.current
    dialog.showModal()
    return () => { dialog.close(); if (previous?.isConnected) previous.focus?.({ preventScroll: true }) }
  }, [])
  return createPortal(<dialog className="experience-dialog" ref={ref} aria-labelledby={titleId}
    style={{ '--team': team?.color, '--team-secondary': team?.accent }}
    onCancel={event => { event.preventDefault(); onClose() }}>
    <div className="experience-toolbar"><h2 id={titleId}>{title}</h2>
      {fullscreen && typeof document.documentElement.requestFullscreen === 'function' ? <button onClick={() => ref.current.requestFullscreen().catch(() => {})}>Fullscreen</button> : null}
      <button autoFocus onClick={onClose} aria-label={`Close ${title}`}>Close</button>
    </div>{children}
  </dialog>, document.body)
}
