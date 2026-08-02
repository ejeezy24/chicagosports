import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Run an async loader whenever `deps` change, discarding results from runs that
 * have been superseded. Requests themselves are shared/cached in api.js, so
 * this deliberately doesn't abort them — a cancelled panel shouldn't tear down
 * a fetch another panel is waiting on.
 *
 * The returned `refresh()` re-runs the loader in "soft" mode: it asks for fresh
 * data but leaves what's on screen alone until the new payload arrives. A live
 * score that blanked to skeletons every thirty seconds — collapsing any open
 * boxscore with it — would be worse than one that updates a beat late.
 */
export function useAsync(loader, deps) {
  const [state, setState] = useState({ loading: true, data: null, error: null })
  const [nonce, setNonce] = useState(0)
  const soft = useRef(false)

  const refresh = useCallback(() => {
    soft.current = true
    setNonce((n) => n + 1)
  }, [])

  useEffect(() => {
    let current = true
    const isSoft = soft.current
    soft.current = false

    if (!isSoft) setState({ loading: true, data: null, error: null })

    Promise.resolve()
      .then(() => loader({ fresh: isSoft }))
      .then(
        (data) => current && setState({ loading: false, data, error: null }),
        (error) => {
          if (!current) return
          // A refresh that fails keeps whatever is already on screen. One flaky
          // poll shouldn't replace a working scoreboard with an error panel.
          if (isSoft) return
          setState({ loading: false, data: null, error })
        },
      )

    return () => {
      current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce])

  return { ...state, refresh }
}
