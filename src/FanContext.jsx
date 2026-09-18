import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { dayKey, gameKey, normalizeFanData } from './fan.js'

const FanContext = createContext(null)
const STORAGE_KEY = 'cs.fan.v1'

export function FanProvider({ children }) {
  const [data, setData] = useState(() => {
    try { return normalizeFanData(JSON.parse(localStorage.getItem(STORAGE_KEY))) }
    catch { return normalizeFanData(null) }
  })
  const [storageError, setStorageError] = useState(false)
  const [revealed, setRevealed] = useState(new Set())
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); setStorageError(false) }
    catch { setStorageError(true) }
  }, [data])
  useEffect(() => {
    const sync = (event) => {
      if (event.key !== STORAGE_KEY && event.key !== null) return
      try { setData(normalizeFanData(JSON.parse(event.newValue))); setRevealed(new Set()) } catch { /* Ignore malformed data from another tab. */ }
    }
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])
  const mergeTicketGames = useCallback((updates) => setData((d) => {
    const tickets = { ...d.tickets }
    for (const [key, game] of Object.entries(updates)) {
      if (tickets[key]) tickets[key] = { ...tickets[key], game }
    }
    return { ...d, tickets }
  }), [])
  const value = {
    mergeTicketGames,
    ...data, storageError,
    setSpoiler: (spoiler) => { setData((d) => ({ ...d, spoiler })); setRevealed(new Set()) },
    visible: (key) => !data.spoiler || revealed.has(key),
    reveal: (key) => setRevealed((prev) => new Set([...prev, key])),
    saveTicket: (team, game, kind, note) => setData((d) => ({ ...d, tickets: { ...d.tickets, [gameKey(team, game)]: { teamKey: team.key, game, kind, note: note.slice(0, 500) } } })),
    removeTicket: (key) => setData((d) => { const tickets = { ...d.tickets }; delete tickets[key]; return { ...d, tickets } }),
    answer: (day, choice, correct) => setData((d) => d.answers[day] ? d : { ...d, answers: { ...d.answers, [day]: { choice, correct } } }),
  }
  return <FanContext.Provider value={value}>{children}</FanContext.Provider>
}

export const useFan = () => useContext(FanContext)

export function SpoilerGate({ scope, label = 'results', children }) {
  const fan = useFan()
  if (fan.visible(scope)) return children
  return <div className="spoiler-gate"><span>Results hidden · spoiler-free mode</span><button className="pixel-button" onClick={() => fan.reveal(scope)}>Reveal {label}</button></div>
}

export function useChicagoDay() {
  const [today, setToday] = useState(() => dayKey())
  useEffect(() => {
    const tick = () => setToday(dayKey())
    const timer = setInterval(tick, 30_000)
    document.addEventListener('visibilitychange', tick)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', tick) }
  }, [])
  return today
}
