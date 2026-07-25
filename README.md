# Chicago Sports

Schedules, scores, rosters, and stats for all five Chicago pro clubs — Cubs,
White Sox, Bears, Bulls, Blackhawks — with a season picker that goes back
decades.

- **Schedule & scores** — every game for the chosen season with results, scores,
  venue, broadcast, and a running record; preseason / regular / postseason toggle.
- **Roster** — players grouped by position with number, height, weight, age,
  college, and birthplace, plus a filter box.
- **Team stats** — season totals, per-game averages, and league ranks.
- **Standings** — the club's division table for that season, with the Chicago
  team highlighted.

Team cards at the top show each club's current record and next game, so the
picker doubles as a "what's on today" strip. Times are shown in Chicago time.

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
| Team statistics | `site.web.api.espn.com/apis/common/v3/sports/{sport}/{league}/teams/{id}/statistics?season={year}` |
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
  seasons.js     season numbering, current-season logic, dropdown options
  format.js      dates and times, all in America/Chicago
  useAsync.js    loading / error / data hook
  components/    TeamPicker, Schedule, Roster, TeamStats, Standings, ui
test/
  normalize.test.mjs
```

Unofficial, and unaffiliated with ESPN or any club.
