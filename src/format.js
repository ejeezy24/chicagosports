// Everything is shown in Chicago time — that's the point of the app.
const TZ = 'America/Chicago'

const dayFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  weekday: 'short',
  month: 'short',
  day: 'numeric',
})

const dayYearFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

const timeFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  hour: 'numeric',
  minute: '2-digit',
})

const parse = (iso) => {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

export function formatDate(iso, { withYear = false } = {}) {
  const d = parse(iso)
  if (!d) return 'TBD'
  return (withYear ? dayYearFmt : dayFmt).format(d)
}

export function formatTime(iso) {
  const d = parse(iso)
  if (!d) return ''
  // ESPN uses midnight UTC as a placeholder for "time not announced".
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0) return 'TBD'
  return timeFmt.format(d)
}

export function isSameDay(iso, now = new Date()) {
  const d = parse(iso)
  if (!d) return false
  const key = (x) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(x)
  return key(d) === key(now)
}

export function monthKey(iso) {
  const d = parse(iso)
  if (!d) return 'Scheduled'
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    month: 'long',
    year: 'numeric',
  }).format(d)
}
