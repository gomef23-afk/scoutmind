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

  const from = isoDate(-back);
  const to = isoDate(ahead);

  let rows = 0;
  const skipped = [];
  // Per-league diagnostics. `rows_written` alone cannot distinguish "the API
  // returned nothing" from "we dropped everything", so report both ends.
  const byLeague = [];

  for (const lg of leagues) {
    const params = {
      league: lg.api_league_id,
      season: lg.current_season,
      from,
      to,
    };
    let json = await api.get('fixtures', params);
    let seasonFallback = false;

    // If a league returns nothing for a normal match week, the usual cause is
    // a wrong `season` for that competition (Europe's 2026-27 vs Brazil's
    // calendar year). Retry once without it: from/to alone is enough to scope
    // the query, and this both self-heals and tells us which league is
    // mis-seeded. Guarded so a rejected retry cannot fail the whole run.
    if ((json.results ?? 0) === 0) {
      try {
        const retry = await api.get('fixtures', {
          league: lg.api_league_id,
          from,
          to,
        });
        if ((retry.results ?? 0) > 0) {
          json = retry;
          seasonFallback = true;
        }
      } catch (e) {
        console.warn(`[fixtures] ${lg.slug} season-less retry failed:`, e.message);
      }
    }

    const apiResults = json.results ?? 0;
    const responseLen = (json.response || []).length;
    let leagueSkipped = 0;

    const fixtureRows = [];
    for (const r of json.response || []) {
      const home = teams.get(r.teams?.home?.id);
      const away = teams.get(r.teams?.away?.id);

      // A fixture whose teams we have not ingested yet would violate the FK.
      // Record it and move on rather than failing the whole run — run
      // /api/cron/teams and this will pick them up next time.
      if (!home || !away) {
        skipped.push(r.fixture?.id);
        leagueSkipped++;
        continue;
      }

      fixtureRows.push({
        api_fixture_id: r.fixture.id,
        league_id: lg.id,
        // Trust the payload's own season over our seed — it is authoritative,
        // and after a season-less retry it is the only correct value.
        season: r.league?.season ?? lg.current_season,
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

    const written = await upsert('fixtures', fixtureRows, 'api_fixture_id');
    rows += written;

    const diag = {
      league: lg.slug,
      api_league_id: lg.api_league_id,
      season_requested: lg.current_season,
      season_in_payload: json.response?.[0]?.league?.season ?? null,
      api_results: apiResults,
      response_len: responseLen,
      pages: json.paging?.total ?? null,
      mapped: fixtureRows.length,
      skipped: leagueSkipped,
      written,
      season_fallback_used: seasonFallback,
    };
    byLeague.push(diag);
    console.log('[fixtures]', JSON.stringify(diag));
  }

  const s = api.stats();
  return {
    rows_written: rows,
    requests_used: s.used,
    quota_remaining: s.remaining,
    window: `${from} .. ${to}`,
    skipped_unknown_teams: skipped.length,
    by_league: byLeague,
  };
});
