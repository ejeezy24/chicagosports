import { useEffect } from 'react'
export function VictoryCelebration({ team, onClose }) {
  useEffect(() => { const timer = setTimeout(onClose, 6500); return () => clearTimeout(timer) }, [onClose])
  return <aside className="victory-celebration" role="status"><div className="victory-confetti" aria-hidden="true">{Array.from({ length: 24 }, (_, i) => <i key={i} style={{ '--i': i, '--color': i % 2 ? team.color : team.accent }} />)}</div><strong>{team.short} win!</strong><span>Final score confirmed.</span><button onClick={onClose}>Dismiss</button></aside>
}
