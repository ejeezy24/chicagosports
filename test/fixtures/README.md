# Browser fixtures

Trimmed public ESPN and MLB responses captured on 2026-09-17. These are only
browser-test inputs; the application never imports them. The 2015/2016 schedule
fixtures deliberately contain a small sample of games, including the Cubs–Sox
series, rather than complete seasons. The summary keeps line scores; player
leaders use a small 2016 sample for testing rendering, not statistical accuracy.

Sources:
- `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/teams/16/schedule?season=2016&seasontype=2` (and 2015)
- `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/summary?event=360404103`
- `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?dates=20260917` (through September 20)
- `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=20260920`
- `https://statsapi.mlb.com/api/v1/teams/112/roster?rosterType=fullSeason&season=2016&hydrate=person(stats(type=season,season=2016,gameType=R))`

Run `npm run dev -- --port 5174` in one terminal, then
`./test/verify-browser.ps1` in another with `agent-browser` installed. The runner
uses its own browser session and a test-only clock anchored to the fixture dates.
Screenshots go in `test/artifacts/`. The unit suite remains `npm test`.

These checks cover the UI and response contracts. They do not prove that an
upstream service is reachable from a deployed host. In this environment ESPN
accepted direct curl downloads but returned HTTP 403 for browser-forwarded requests.
