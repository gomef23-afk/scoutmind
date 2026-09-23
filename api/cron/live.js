// R4 — live score refresh.
//
// Exactly ONE request regardless of how many matches are on: `live=all` returns
// every in-play fixture worldwide and we keep the ones in our active leagues.
// If nothing is live it writes nothing, so running this every few minutes costs
// one request per tick and no database churn.
//
// Free tier maths: 100 req/day total. At */10 that is 144 ticks/day — too many.
// Configure cron-job.org to run this only during match windows (see README in
// the summary) or at */30 for ~48/day.

import { createClient } from '../_lib/apifootball.js';
import { activeLeagues, teamIdMap, upsert } from '../_lib/supabase.js';
import { withCron } from '../_lib/cron.js';

export default withCron('live', async () => {
  const api = createClient();
  const leagues = await activeLeagues();
  const byApiId = new Map(leagues.map((l) => [l.api_league_id, l]));

  const json = await api.get('fixtures', { live: 'all' });
  const all = json.response || [];
  const mine = all.filter((r) => byApiId.has(r.league?.id));

  let rows = 0;
  if (mine.length) {
    const teams = await teamIdMap(leagues.map((l) => l.id));
    const fixtureRows = [];

    for (const r of mine) {
      const lg = byApiId.get(r.league.id);
      const home = teams.get(r.teams?.home?.id);
      const away = teams.get(r.teams?.away?.id);
      if (!home || !away) continue;

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
    rows = await upsert('fixtures', fixtureRows, 'api_fixture_id');
  }

  const s = api.stats();
  return {
    rows_written: rows,
    requests_used: s.used,
    quota_remaining: s.remaining,
    live_worldwide: all.length,
    live_in_our_leagues: mine.length,
  };
});
