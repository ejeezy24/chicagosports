# Chicago Sports

Schedules, scores, rosters, and stats for all five Chicago pro clubs — Cubs,
White Sox, Bears, Bulls, Blackhawks — with a season picker that goes back
decades.

- **Schedule & scores** — every game for the chosen season with results, scores,
  venue, broadcast, and a running record; preseason / regular / postseason toggle.
- **Boxscores** — expand any played game for the line score by inning, quarter or
  period, both teams' statistics side by side, and the attendance footer.
- **Roster** — players grouped by position with number, height, weight, age,
  college, and birthplace, plus a filter box.
- **Team stats** — season totals, per-game averages, and league ranks.
- **Standings** — the club's division table for that season, with the Chicago
  team highlighted.

Team cards at the top show each club's current record and next game, so the
picker doubles as a "what's on today" strip. Times are shown in Chicago time.

## Stadiums

Hover (or tab to) any Chicago venue name — in the controls bar, or on a home
game in the schedule — and the ground it stands on turns underneath it, next to
a note on when it opened and what happened there.

The view is a USGS aerial, straight down. That choice is doing real work:
spinning a flat photo normally reads as a spinning postcard, but from directly
overhead a rotation is a genuine one, so the picture turns the way the ground
would. Each aerial is framed wide enough to keep the building in the middle 70%,
because a square has to be at least its own diagonal to cover a square window at
every angle — otherwise the corners sweep into view mid-turn.

The imagery is a work of the US federal government and so public domain. It is
bundled at build time (`src/assets/venues/`, ~110 kB for all four) rather than
requested at runtime, which keeps ESPN the app's only network dependency.
Escape closes the card; `prefers-reduced-motion` holds the aerial still, north
up.

The four buildings and their history are the one part of the app that isn't
fetched — ESPN gives a venue name and little else, so `src/venues.js` carries the
rest. Former names are listed there too, which is how a 2004 schedule still
resolves "U.S. Cellular Field" to the right building.

The whole thing is styled as an arcade cabinet: bitmap type (Press Start 2P for
chrome, Silkscreen for data), square corners, hard offset shadows instead of
blur, nearest-neighbour logo scaling, and a CRT scanline wash over the page.
Both fonts are bundled via `@fontsource` rather than pulled from a CDN, so the
look holds up offline. Animations are stepped, and drop out entirely under
`prefers-reduced-motion`.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # normalizer + season-logic tests
npm run build
```

## Where the data comes from

ESPN's public (undocumented, unauthenticated) endpoints:

| What | Endpoint |
| --- | --- |
| Team profile, record, next game | `site.api.espn.com/apis/site/v2/sports/{sport}/{league}/teams/{id}` |
| Schedule | `…/teams/{id}/schedule?season={year}&seasontype={1,2,3}` |
| Roster | `…/teams/{id}/roster?season={year}` |
| Team statistics | `sports.core.api.espn.com/v2/sports/{sport}/leagues/{league}/seasons/{year}/types/2/teams/{id}/statistics` |
| Boxscore | `…/{sport}/{league}/summary?event={gameId}` |
| Standings | `site.api.espn.com/apis/v2/sports/{sport}/{league}/standings?season={year}&level=3` |

No API key, no account, no rate-limit paperwork — but also no service
guarantees. These are the endpoints ESPN's own site uses, and they can change
shape without notice, so `src/espn.js` reads every payload defensively and each
panel degrades to a message rather than a blank screen.

### Requests go through a same-origin proxy

The browser never calls ESPN directly, which keeps CORS out of the picture:

- `vite.config.js` proxies `/espn`, `/espnweb`, and `/espncore` in `dev` and `preview`.
- `vercel.json` does the same with rewrites for a deployed build.
- If neither is present (plain static hosting), `src/api.js` falls back to
  calling ESPN's origin directly.

Deploying somewhere other than Vercel? Port the three rewrites in `vercel.json`
to that host, or rely on the direct fallback.

## Season numbering

MLB and NFL seasons are identified by a single year. NBA and NHL seasons are
keyed by the **ending** year — ESPN's `2024` is the 2023-24 season — so the UI
labels those `2023-24` while sending `2024`. `src/seasons.js` also works out
which season is "current" per league, since their calendars don't line up.

The dropdown starts at each league's modern era by default; tick **Show seasons
back to …** to reach the older ones. Coverage thins out the further back you go
and varies by league — that's ESPN's archive, not a bug in the app. Historical
rosters in particular aren't published for every league; when ESPN answers with
the current roster instead, the app says so rather than mislabelling it.

## Layout

```
src/
  api.js         fetch client — same-origin proxy, direct fallback, request cache
  espn.js        normalizers for the payload shapes (they vary by league and era)
  teams.js       the five clubs: ESPN ids, colours, venues, season ranges
  venues.js      the four buildings and their history
  assets/venues/ USGS aerials, one per building, bundled at build time
  seasons.js     season numbering, current-season logic, dropdown options
  format.js      dates and times, all in America/Chicago
  useAsync.js    loading / error / data hook
  components/    TeamPicker, Schedule, Boxscore, Roster, TeamStats, Standings,
                 Venue, ui
test/
  normalize.test.mjs
```

Unofficial, and unaffiliated with ESPN or any club.
