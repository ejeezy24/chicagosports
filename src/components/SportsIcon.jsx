const paths = {
  clubhouse: <><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" /></>,
  tonight: <><rect x="3" y="5" width="18" height="12" rx="2" /><path d="M8 21h8M12 17v4m-7-8 3-2 3 3 4-5 4 2" /></>,
  mygames: <><path d="M4 6h16a1 1 0 0 1 1 1v3a2 2 0 0 0 0 4v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3a2 2 0 0 0 0-4V7a1 1 0 0 1 1-1Z" /><path d="M15 6v2m0 3v2m0 3v2" /></>,
  arcade: <><path d="M7 7h10c2 0 3 2 3.5 4l1 5c.5 3-2 4-4 1l-1-1h-9l-1 1c-2 3-4.5 2-4-1l1-5C4 9 5 7 7 7Z" /><path d="M7 10v5m-2.5-2.5h5M16 11h.01M18 14h.01" /></>,
  timemachine: <><path d="M3 11a9 9 0 1 1 3 8M3 4v7h7" /><path d="M12 7v5l3 2" /></>,
  stadiums: <><path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
}

export function SportsIcon({ name, className, size = 18 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className={className}>{paths[name] ?? paths.clubhouse}</svg>
}
