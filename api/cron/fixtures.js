// R4 — fixture schedule + results.
//
// One request per active league covering yesterday through +7 days, so the
// Matches page always has recent results and the next week of kickoffs.
// Cost: 1 request per active league (2/day on the free tier).

import { createClient } from '../_lib/apifootball.js';
import { activeLeagues, teamIdMap, upsert } from '../_lib/supabase.js';
import { withCron, isoDate } from '../_lib/cron.js';

export default withCron('fixtures', async ({ req }) => {
  const api = createClient();
  const url = new URL(req.url, 'http://localhost');
  const back = Number(url.searchParams.get('back') ?? 1);
  const ahead = Number(url.searchParams.get('ahead') ?? 7);

  const leagues = await activeLeagues();
  const teams = await teamIdMap(leagues.map((l) => l.id));

  let rows = 0;
  const skipped = [];

  for (const lg of leagues) {
    const json = await api.get('fixtures', {
      league: lg.api_league_id,
      season: lg.current_season,
      from: isoDate(-back),
      to: isoDate(ahead),
    });

    const fixtureRows = [];
    for (const r of json.response || []) {
      const home = teams.get(r.teams?.home?.id);
      const away = teams.get(r.teams?.away?.id);

      // A fixture whose teams we have not ingested yet would violate the FK.
      // Record it and move on rather than failing the whole run — run
      // /api/cron/teams and this will pick them up next time.
      if (!home || !away) {
        skipped.push(r.fixture?.id);
        continue;
      }

      fixtureRows.push({
        api_fixture_id: r.fixture.id,
        league_id: lg.id,
        season: lg.current_season,
        round: r.league?.round || null,
        kickoff_utc: r.fixture?.date || null,
        status_short: r.fixture?.status?.short || null,
        elapsed: r.fixture?.status?.elapsed ?? null,
        home_team_id: home,
        away_team_id: away,
        home_goals: r.goals?.home ?? null,
        away_goals: r.goals?.away ?? null,
        venue_name: r.fixture?.venue?.name || null,
        updated_at: new Date().toISOString(),
      });
    }

    rows += await upsert('fixtures', fixtureRows, 'api_fixture_id');
  }

  const s = api.stats();
  return {
    rows_written: rows,
    requests_used: s.used,
    quota_remaining: s.remaining,
    window: `${isoDate(-back)} .. ${isoDate(ahead)}`,
    skipped_unknown_teams: skipped.length,
  };
});
