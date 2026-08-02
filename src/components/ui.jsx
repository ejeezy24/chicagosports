import { Component } from 'react'

export function Panel({ title, aside, note, children }) {
  return (
    <section className="panel">
      {(title || aside) && (
        <div className="panel-head">
          <h2>{title}</h2>
          {aside ? <div className="count">{aside}</div> : null}
        </div>
      )}
      {note ? <div className="note">{note}</div> : null}
      <PanelBoundary>{children}</PanelBoundary>
    </section>
  )
}

/**
 * A panel that throws while rendering should fail as a panel, not as the whole
 * page. The normalizers read these payloads defensively, but they are shaped by
 * someone else and a field that has always been an object can arrive as null;
 * without this, one such surprise unmounts the entire app and leaves a blank
 * screen — the thing every other error path here exists to avoid.
 */
class PanelBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="state error">
        Something in this panel didn&apos;t render.
        <small>{this.state.error.message ?? String(this.state.error)}</small>
        <small>The rest of the app is unaffected — try another season or team.</small>
      </div>
    )
  }
}

export function Loading({ rows = 5 }) {
  return (
    <div style={{ padding: '8px 0' }}>
      {Array.from({ length: rows }, (_, i) => (
        <div className="skeleton" key={i} />
      ))}
    </div>
  )
}

export function Empty({ children }) {
  return <div className="state">{children}</div>
}

export function ErrorState({ error, what, onRetry }) {
  return (
    <div className="state error">
      Couldn&apos;t load {what}.
      <small>{error?.message ?? String(error)}</small>
      <small>
        These come straight from ESPN&apos;s public endpoints — older seasons and
        off-season windows are sometimes simply not published.
      </small>
      {onRetry ? (
        <button className="retry" onClick={onRetry}>
          Try again
        </button>
      ) : null}
    </div>
  )
}

/** Renders loading / error / empty for a useAsync result, or the children. */
export function Async({ state, what, rows, isEmpty, empty, children }) {
  if (state.loading) return <Loading rows={rows} />
  if (state.error) return <ErrorState error={state.error} what={what} onRetry={state.retry} />
  if (isEmpty?.(state.data)) return <Empty>{empty}</Empty>
  return (
    <>
      {state.updatedAt ? <UpdatedAt value={state.updatedAt} /> : null}
      {children(state.data)}
    </>
  )
}

const chicagoTime = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'America/Chicago',
  timeZoneName: 'short',
})

function UpdatedAt({ value }) {
  return (
    <div className="data-status" role="status">
      Data refreshed {chicagoTime.format(value)}
    </div>
  )
}
