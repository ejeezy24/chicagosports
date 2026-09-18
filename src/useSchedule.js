import { useEffect, useMemo } from 'react'
import { getSchedule, getScoreboard } from './api.js'
import { scheduleEvents, scoreboardScores, withLiveScores } from './espn.js'
import { isCancelled } from './fan.js'
import { useAsync } from './useAsync.js'
import { useLivePoll } from './useLivePoll.js'

// Wake at the next scheduled start. If the feed is late, keep checking until
// the game goes live, finishes, or is marked postponed/cancelled.
export function useGameStart(refresh, games) {
  const now = Date.now()
  const future = games.filter((g) => !g.completed && g.state === 'pre' && !g.timeTbd && !isCancelled(g) && new Date(g.date).getTime() > now)
  const next = future.reduce((min, g) => Math.min(min, new Date(g.date).getTime()), Infinity)
  const overdue = games.some((g) => !g.completed && g.state === 'pre' && !g.timeTbd && !isCancelled(g) && now >= new Date(g.date).getTime() && now - new Date(g.date).getTime() < 12 * 60 * 60_000)
  useLivePoll(refresh, overdue)
  useEffect(() => {
    if (!Number.isFinite(next)) return
    const timer = setTimeout(refresh, Math.min(2_147_000_000, Math.max(1000, next - Date.now() + 10_000)))
    return () => clearTimeout(timer)
  }, [next, refresh])
}

export function useSchedule(team, season, seasonType = 2) {
  const state = useAsync(({ fresh }) => getSchedule(team, season, seasonType, { fresh }), [team.key, season, seasonType])
  const scheduled = useMemo(() => scheduleEvents(state.data, team.espnId), [state.data, team.espnId])
  const anyLive = scheduled.some((g) => g.state === 'in')
  const live = useAsync(({ fresh }) => anyLive ? getScoreboard(team, { fresh }) : Promise.resolve(null), [team.key, anyLive])
  const games = useMemo(() => withLiveScores(scheduled, scoreboardScores(live.data)), [scheduled, live.data])
  useLivePoll(live.refresh, games.some((g) => g.state === 'in'))
  useGameStart(state.refresh, games)
  return { state, games }
}
