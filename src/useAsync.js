import { useEffect, useState } from 'react'

/**
 * Run an async loader whenever `deps` change, discarding results from runs that
 * have been superseded. Requests themselves are shared/cached in api.js, so
 * this deliberately doesn't abort them — a cancelled panel shouldn't tear down
 * a fetch another panel is waiting on.
 */
export function useAsync(loader, deps) {
  const [state, setState] = useState({ loading: true, data: null, error: null })

  useEffect(() => {
    let current = true
    setState({ loading: true, data: null, error: null })

    Promise.resolve()
      .then(loader)
      .then(
        (data) => current && setState({ loading: false, data, error: null }),
        (error) => current && setState({ loading: false, data: null, error }),
      )

    return () => {
      current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return state
}
