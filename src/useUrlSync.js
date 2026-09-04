import { useEffect, useRef } from 'react'
import { resolveState, toSearch } from './urlState.js'

/**
 * Keeps the address bar and the app in step, in both directions.
 *
 * @param state      {teamKey, season, tab, archiveView, seasonType, gameId, includeOlder}
 * @param onRestore  called with a resolved state when the user goes back/forward
 * @param storedTeamKey  localStorage fallback, for entries with no team parameter
 */
export function useUrlSync(state, onRestore, storedTeamKey) {
  const { teamKey, season, tab, archiveView, seasonType, gameId, includeOlder } = state

  // The first write only tidies the URL someone arrived on, so it must not add
  // a history entry. Nor must the write that follows a back/forward, or popping
  // to a non-canonical old entry would push and destroy the forward stack.
  const firstWrite = useRef(true)
  const suppressPush = useRef(false)
  const restore = useRef(onRestore)
  restore.current = onRestore

  useEffect(() => {
    // Deferred by a macrotask on purpose. Switching to a club whose seasons
    // start later produces two commits from one click — App clamps the season,
    // then snaps it into the visible list — and writing synchronously would
    // push two history entries, so one Back press would land on a state the app
    // immediately corrects again. The cleanup cancels the superseded write and
    // the cascade collapses into a single entry.
    const id = setTimeout(() => {
      const next = toSearch({ teamKey, season, tab, archiveView, seasonType, gameId, includeOlder }, window.location.search)
      if (next === window.location.search) {
        firstWrite.current = false
        return
      }

      const url = `${window.location.pathname}${next}${window.location.hash}`
      const replace = firstWrite.current || suppressPush.current
      window.history[replace ? 'replaceState' : 'pushState'](null, '', url)

      firstWrite.current = false
      suppressPush.current = false
    }, 0)

    return () => clearTimeout(id)
  }, [teamKey, season, tab, archiveView, seasonType, gameId, includeOlder])

  useEffect(() => {
    const onPop = () => {
      suppressPush.current = true
      restore.current(resolveState(window.location.search, storedTeamKey))
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [storedTeamKey])
}
