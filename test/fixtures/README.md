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

Run `npm run test:browser` for browser checks and `npm test` for unit checks.

These checks cover the UI and response contracts. They do not prove that an
upstream service is reachable from a deployed host. In this environment ESPN
accepted direct curl downloads but returned HTTP 403 for browser-forwarded requests.

Live-game normalization fixtures retain the original status, plays, drives, and
leader shapes, with unrelated profile fields removed:
- MLB `401816978`: `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/summary?event=401816978`
- NFL `401772965`: `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=401772965`
- NBA `401811048`: `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=401811048`
- NHL `401803656`: `https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/summary?event=401803656`

Run the browser suite with `npm run test:browser`; Playwright starts the local
preview on port 4174 and writes screenshots to the ignored `test-results/` folder.


Standings fixtures use the real division tree for all four leagues, retaining
season, teams, and the stat fields displayed by the race panel:
`https://site.api.espn.com/apis/v2/sports/{sport}/{league}/standings?season=2026&level=3&seasontype=2`.
`race-mlb-level2.json` captures the same endpoint at level 2 for league-level
seeds and games-behind comparisons. These snapshots are test data, not current records.
