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
      {children}
    </section>
  )
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

export function ErrorState({ error, what }) {
  return (
    <div className="state error">
      Couldn&apos;t load {what}.
      <small>{error?.message ?? String(error)}</small>
      <small>
        These come straight from ESPN&apos;s public endpoints — older seasons and
        off-season windows are sometimes simply not published.
      </small>
    </div>
  )
}

/** Renders loading / error / empty for a useAsync result, or the children. */
export function Async({ state, what, rows, isEmpty, empty, children }) {
  if (state.loading) return <Loading rows={rows} />
  if (state.error) return <ErrorState error={state.error} what={what} />
  if (isEmpty?.(state.data)) return <Empty>{empty}</Empty>
  return children(state.data)
}
