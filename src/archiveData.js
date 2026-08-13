export const ARCHIVE = {
  cubs: {
    championships: [1907, 1908, 2016],
    record: { label: 'Career home runs', value: '545', holder: 'Sammy Sosa' },
    source: { label: 'Cubs history', url: 'https://www.mlb.com/cubs/history' },
    legends: ['Ernie Banks', 'Ryne Sandberg', 'Sammy Sosa', 'Fergie Jenkins', 'Ron Santo', 'Billy Williams'],
    moments: [
      { date: '1984-06-23', title: 'The Sandberg Game', detail: 'Ryne Sandberg homered twice late as the Cubs beat St. Louis 12-11 in 11 innings.' },
      { date: '1998-05-06', title: 'Kerry Wood strikes out 20', detail: 'The rookie tied the major-league record in a one-hit shutout of Houston.' },
      { date: '2016-11-02', title: 'The drought ends', detail: 'The Cubs won Game 7 in Cleveland for their first World Series title in 108 years.', championship: true },
    ],
  },
  whitesox: {
    championships: [1906, 1917, 2005],
    record: { label: 'Career home runs', value: '448', holder: 'Frank Thomas' },
    source: { label: 'White Sox history', url: 'https://www.mlb.com/whitesox/history' },
    legends: ['Frank Thomas', 'Paul Konerko', 'Minnie Miñoso', 'Luis Aparicio', 'Nellie Fox', 'Mark Buehrle'],
    moments: [
      { date: '2005-10-26', title: 'South Side champions', detail: 'The White Sox completed a World Series sweep of Houston, ending an 88-year title wait.', championship: true },
      { date: '2009-07-23', title: 'Buehrle is perfect', detail: 'Mark Buehrle retired all 27 Tampa Bay hitters, helped by “The Catch” from DeWayne Wise.' },
      { date: '2021-08-12', title: 'Field of Dreams walk-off', detail: 'Tim Anderson ended the first MLB game in Iowa with a ninth-inning home run.' },
    ],
  },
  bears: {
    championships: [1921, 1932, 1933, 1940, 1941, 1943, 1946, 1963, 1985],
    record: { label: 'Career rushing yards', value: '16,726', holder: 'Walter Payton' },
    source: { label: 'Bears history', url: 'https://www.chicagobears.com/team/history/' },
    legends: ['Walter Payton', 'Dick Butkus', 'Gale Sayers', 'Mike Ditka', 'Brian Urlacher', 'Sid Luckman'],
    moments: [
      { date: '1940-12-08', title: 'The 73-0 title game', detail: 'Chicago defeated Washington in the most lopsided game in NFL history.' },
      { date: '1984-10-07', title: 'Sweetness takes the record', detail: 'Walter Payton passed Jim Brown to become the NFL career rushing leader.' },
      { date: '1986-01-26', title: 'Super Bowl XX', detail: 'The 1985 Bears finished their run with a 46-10 win over New England.', championship: true },
    ],
  },
  bulls: {
    championships: [1991, 1992, 1993, 1996, 1997, 1998],
    record: { label: 'Career points', value: '29,277', holder: 'Michael Jordan' },
    source: { label: 'Bulls team history', url: 'https://www.nba.com/team/1610612741/bulls' },
    legends: ['Michael Jordan', 'Scottie Pippen', 'Dennis Rodman', 'Derrick Rose', 'Artis Gilmore', 'Toni Kukoč'],
    moments: [
      { date: '1991-06-12', title: 'The first championship', detail: 'Chicago completed a 4-1 Finals win over the Lakers and started its first three-peat.', championship: true },
      { date: '1996-06-16', title: '72 wins and ring No. 4', detail: 'The Bulls beat Seattle to complete one of basketball’s defining seasons.', championship: true },
      { date: '1998-06-14', title: 'The Last Shot', detail: 'Michael Jordan sealed a sixth championship in Utah with 5.2 seconds left.', championship: true },
    ],
  },
  blackhawks: {
    championships: [1934, 1938, 1961, 2010, 2013, 2015],
    record: { label: 'Career points', value: '1,467', holder: 'Stan Mikita' },
    source: { label: 'Blackhawks records', url: 'https://records.nhl.com/chi/records/skater-records/points/most-points-career' },
    legends: ['Stan Mikita', 'Bobby Hull', 'Patrick Kane', 'Jonathan Toews', 'Tony Esposito', 'Denis Savard'],
    moments: [
      { date: '1961-04-16', title: 'The third Stanley Cup', detail: 'The Black Hawks defeated Detroit to win their first championship since 1938.', championship: true },
      { date: '2010-06-09', title: 'Kane ends the wait', detail: 'Patrick Kane scored in overtime to secure Chicago’s first Stanley Cup in 49 years.', championship: true },
      { date: '2013-06-24', title: 'Seventeen seconds', detail: 'Two late goals in Boston turned Game 6 and delivered another Stanley Cup.', championship: true },
      { date: '2015-06-15', title: 'Cup on home ice', detail: 'Chicago won its sixth Stanley Cup and first clinched at home since 1938.', championship: true },
    ],
  },
}

export const allArchiveEntries = () =>
  Object.entries(ARCHIVE).flatMap(([teamKey, data]) => [
    ...data.legends.map((name) => ({ type: 'Player', title: name, detail: 'Chicago legend', teamKey })),
    ...data.moments.map((moment) => ({ type: 'Moment', title: moment.title, detail: moment.detail, teamKey, ...moment })),
  ])

export function closestAnniversary(teamKey, now = new Date()) {
  const moments = ARCHIVE[teamKey]?.moments ?? []
  if (!moments.length) return null
  const month = now.getMonth() + 1
  const day = now.getDate()
  const keyed = moments.map((moment) => {
    const [, m, d] = moment.date.split('-').map(Number)
    let distance = new Date(now.getFullYear(), m - 1, d) - new Date(now.getFullYear(), month - 1, day)
    if (distance < 0) distance += 365.25 * 24 * 60 * 60 * 1000
    return { ...moment, exact: m === month && d === day, distance }
  })
  return keyed.find((event) => event.exact) ?? keyed.sort((a, b) => a.distance - b.distance)[0]
}
