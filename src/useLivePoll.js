import { useEffect, useRef } from 'react'

/** ESPN's own scoreboard refreshes about this often, and these endpoints are
 *  CDN-cached at roughly that granularity — polling faster mostly buys another
 *  round trip returning identical bytes. */
export const LIVE_POLL_MS = 30_000

/** Enough to swallow a StrictMode double-invoke or a flurry of tab switches. */
const MIN_GAP_MS = 5_000

/**
 * Calls `refresh()` on an interval while `active` and the tab is visible.
 *
 * Nothing polls when nothing is live, and nothing polls in a background tab —
 * but coming back to the tab refreshes immediately, since the score has almost
 * certainly moved while you were away, and that's the case that actually
 * matters.
 */
export function useLivePoll(refresh, active, intervalMs = LIVE_POLL_MS) {
  const latest = useRef(refresh)
  latest.current = refresh
  const lastRun = useRef(0)

  useEffect(() => {
    if (!active) return undefined

    let timer = null

    const run = () => {
      const now = Date.now()
      if (now - lastRun.current < MIN_GAP_MS) return
      lastRun.current = now
      latest.current()
    }

    const start = () => {
      if (timer === null) timer = setInterval(run, intervalMs)
    }
    const stop = () => {
      if (timer !== null) clearInterval(timer)
      timer = null
    }

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        run()
        start()
      } else stop()
    }

    if (document.visibilityState === 'visible') start()
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [active, intervalMs])
}
