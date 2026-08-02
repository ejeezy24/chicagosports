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

// Sortable y-m-d, used only to compare two dates for "same day in Chicago".
const dayKeyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ })

const monthFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  month: 'long',
  year: 'numeric',
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

// These two run once per game row, so a schedule calls them a few hundred
// times per render. Building an Intl.DateTimeFormat costs about 0.1ms, which
// is nothing once and 58ms when it's every row — reuse the formatters above
// rather than constructing them per call.
export function isSameDay(iso, now = new Date()) {
  const d = parse(iso)
  if (!d) return false
  return dayKeyFmt.format(d) === dayKeyFmt.format(now)
}

export function monthKey(iso) {
  const d = parse(iso)
  if (!d) return 'Scheduled'
  return monthFmt.format(d)
}
