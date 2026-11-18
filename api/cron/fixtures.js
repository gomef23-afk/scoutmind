// R4 — fixture schedule + results.
//
// One request per active league covering the last 8 days through the next 21,
// so the Matches page always has recent results AND the next round even when
// the leagues are idle.
//
// The window is deliberately wide because of international breaks: FIFA's
// September 2026 window ran 21 Sept - 6 Oct, sixteen days with no club
// football, and a +7 day window returned literally nothing for six of the
// seven leagues. A ~29 day span always straddles a break.
//
// Cost: 1 request per active league a day, plus one season-less retry for
// any league that returns nothing at all. A league whose season ended more
// than 8 days ago is skipped (its results are final and already held).
//
// Paced (rule 16, commit 1 of the 18-league work): the run stops STARTING a
// league at RUN_BUDGET_MS and saves { day, after_id } in ingest_runs.cursor;
// the next call continues from there, and a call after the day's pass is
// complete does nothing. cron-job.org can therefore call every 30 minutes.
//
//   ?league=championship        that league only (no cursor touched)
//   ?league=serie_c&full=1      its whole current season in one request
//                               (a backfill: no from / to)
//   ?back=30&ahead=60           a wider window, for a backfill

import { createClient } from '../_lib/apifootball.js';
import { activeLeagues, teamIdMap, upsert } from '../_lib/supabase.js';
import { withCron, isoDate, RUN_BUDGET_MS, leaguesFromQuery, seasonOver, dailyPass } from '../_lib/cron.js';

export const TIME_BUDGET_MS = RUN_BUDGET_MS;   // 20 s: cron-job.org gives up at 30 s

export default withCron('fixtures', async ({ req }) => {
  const started = Date.now();
  const api = createClient();
  const url = new URL(req.url, 'http://localhost');
  // back=8 is "yesterday minus 7": a full week of results behind yesterday.
  // Both are overridable per call, e.g. ?back=30&ahead=60 for a backfill.
  const back = Number(url.searchParams.get('back') ?? 8);
  const ahead = Number(url.searchParams.get('ahead') ?? 21);
  const full = url.searchParams.get('full') === '1';

  const all = await activeLeagues();
  const chosen = leaguesFromQuery(req, all);
  // The daily pass: every league not yet done today, minus finished seasons.
  const pass = chosen ? null : await dailyPass('fixtures');
  if (pass && pass.complete) {
    return { rows_written: 0, requests_used: 0, note: 'today\'s pass is complete', cursor: { day: pass.today, complete: true } };
  }
  const leagues = chosen || all.filter((l) => l.id > pass.afterId && !seasonOver(l));
  const teams = await teamIdMap(leagues.map((l) => l.id));

  const from = isoDate(-back);
  const to = isoDate(ahead);

  let rows = 0;
  const skipped = [];
  // Per-league diagnostics. `rows_written` alone cannot distinguish "the API
  // returned nothing" from "we dropped everything", so report both ends.
  const byLeague = [];
  let lastDone = pass ? pass.afterId : 0;
  let stopped = false;

  for (const lg of leagues) {
    if (Date.now() - started > TIME_BUDGET_MS) { stopped = true; break; }
    const params = full
      ? { league: lg.api_league_id, season: lg.current_season }
      : { league: lg.api_league_id, season: lg.current_season, from, to };
    let json = await api.get('fixtures', params);
    const requestUrl = api.lastUrl();
    let fallbackUrl = null;
    let seasonFallback = false;

    // If a league returns nothing for a normal match week, the usual cause is
    // a wrong `season` for that competition (Europe's 2026-27 vs Brazil's
    // calendar year). Retry once without it: from/to alone is enough to scope
    // the query, and this both self-heals and tells us which league is
    // mis-seeded. Guarded so a rejected retry cannot fail the whole run.
    if ((json.results ?? 0) === 0 && !full) {
      try {
        const retry = await api.get('fixtures', {
          league: lg.api_league_id,
          from,
          to,
        });
        fallbackUrl = api.lastUrl();
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
    // /fixtures has not paginated in practice (a full month of Serie A came
    // back as one page of 50), but the window is now ~29 days across leagues
    // of up to 28 teams. If it ever does paginate we would silently lose
    // fixtures, so surface it loudly rather than trust the observation.
    const pages = json.paging?.total ?? 1;
    if (pages > 1) {
      console.warn(
        `[fixtures] ${lg.slug}: ${pages} pages returned, only page 1 ingested — ` +
        `narrow the window or add paging`
      );
    }
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
      pages,
      truncated: pages > 1,
      mapped: fixtureRows.length,
      skipped: leagueSkipped,
      written,
      season_fallback_used: seasonFallback,
      // Exact URLs sent. The API key is a header, so nothing here is secret.
      request_url: requestUrl,
      fallback_url: fallbackUrl,
    };
    byLeague.push(diag);
    console.log('[fixtures]', JSON.stringify(diag));
    lastDone = lg.id;
  }

  const s = api.stats();
  return {
    rows_written: rows,
    requests_used: s.used,
    quota_remaining: s.remaining,
    window: full ? 'whole season' : `${from} .. ${to}`,
    skipped_unknown_teams: skipped.length,
    by_league: byLeague,
    stopped_on: stopped ? 'time_budget' : null,
    // A one-league run (?league=) leaves the daily pass alone.
    cursor: pass ? (stopped ? { day: pass.today, after_id: lastDone } : { day: pass.today, complete: true }) : null,
  };
});
