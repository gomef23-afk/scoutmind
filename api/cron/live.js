// R4 — live score refresh, and finalising matches that have left the feed.
//
// 1. ONE request: `live=all` returns every in-play fixture worldwide; we write
//    the ones in our active leagues.
// 2. FINALISE (19 Nov 2026): a match that ends drops out of `live=all`, and
//    nothing else wrote it again until the fixtures job's next daily pass —
//    which, since commit 1, runs once per UTC day, at about 00:00 UTC, in the
//    middle of Brazil's evening matches. Six Série A games of 18 Nov stayed
//    "LIVE 86'–90'" the next morning and were never scored. So: any fixture in
//    our database still marked live (or not started hours after kick-off),
//    that is NOT in the live feed, is fetched by id (`fixtures?ids=`, up to 20
//    per request) and written with its real status, score and minute. A PATCH
//    by api_fixture_id (rule 25): it can only change a row we hold.
//    Bounded: at most FINALISE_MAX_REQUESTS requests per run, kick-offs of the
//    last 3 days, rows untouched for 15+ minutes (a fixture that stays
//    unresolved costs at most a few requests an hour), and the whole run stops
//    starting work at RUN_BUDGET_MS (rule 16). This step does not look at the
//    fixtures job's cursor at all: a completed daily pass cannot block it.
//
// cron-job.org calls this every 10 minutes.

import { createClient } from '../_lib/apifootball.js';
import { activeLeagues, teamIdMap, upsert, select, update } from '../_lib/supabase.js';
import { isCupRow, keepRound, penalties } from '../_lib/cups.js';
import { withCron, RUN_BUDGET_MS } from '../_lib/cron.js';

/** Statuses API-Football uses while a match is on (or paused within it). */
export const LIVE_STATUSES = ['1H', 'HT', '2H', 'ET', 'BT', 'P', 'LIVE', 'INT', 'SUSP'];
/** Not started yet. Hours after kick-off, the API knows better. */
export const NOT_STARTED = ['NS', 'TBD'];
export const FINALISE_MAX_REQUESTS = 3;    // up to 60 fixtures a run
export const IDS_PER_REQUEST = 20;          // API-Football's limit for fixtures?ids=
export const FINALISE_LOOKBACK_DAYS = 3;
export const STALE_MINUTES = 15;            // untouched this long: the feed has stopped writing it
export const NS_GRACE_MINUTES = 150;        // "not started" this long after kick-off is stale

/** Fixtures we hold that look live (or unstarted) but the feed no longer carries. */
export async function staleFixtures(leagueIds, liveApiIds, now = Date.now()) {
  if (!leagueIds.length) return [];
  const iso = (ms) => new Date(ms).toISOString();
  const since = iso(now - FINALISE_LOOKBACK_DAYS * 86_400_000);
  const quiet = iso(now - STALE_MINUTES * 60_000);
  const nsBefore = iso(now - NS_GRACE_MINUTES * 60_000);
  const rows = await select('fixtures',
    `select=id,api_fixture_id,status_short,kickoff_utc`
    + `&league_id=in.(${leagueIds.join(',')})`
    + `&kickoff_utc=gte.${encodeURIComponent(since)}`
    + `&updated_at=lt.${encodeURIComponent(quiet)}`
    + `&or=(status_short.in.(${LIVE_STATUSES.join(',')}),and(status_short.in.(${NOT_STARTED.join(',')}),kickoff_utc.lt.${encodeURIComponent(nsBefore)}))`
    + `&order=kickoff_utc.asc&limit=${FINALISE_MAX_REQUESTS * IDS_PER_REQUEST * 2}`);
  return rows.filter((f) => !liveApiIds.has(f.api_fixture_id));
}

/** Fetch the stale fixtures by id and write what the API says now. */
export async function finalise(api, stale, started, withPens = false) {
  let requests = 0, written = 0;
  const changed = [];
  for (let i = 0; i < stale.length && requests < FINALISE_MAX_REQUESTS; i += IDS_PER_REQUEST) {
    if (Date.now() - started > RUN_BUDGET_MS) break;
    const chunk = stale.slice(i, i + IDS_PER_REQUEST);
    const json = await api.get('fixtures', { ids: chunk.map((f) => f.api_fixture_id).join('-') });
    requests++;
    const before = new Map(chunk.map((f) => [f.api_fixture_id, f.status_short]));
    for (const r of json.response || []) {
      if (Date.now() - started > RUN_BUDGET_MS) break;
      const id = r.fixture?.id;
      const status = r.fixture?.status?.short || null;
      if (!id || !before.has(id) || !status) continue;
      await update('fixtures', `api_fixture_id=eq.${Number(id)}`, {
        status_short: status,
        elapsed: r.fixture?.status?.elapsed ?? null,
        home_goals: r.goals?.home ?? null,
        away_goals: r.goals?.away ?? null,
        // A match decided on penalties (a cup tie, C-1): only once 039 has run.
        ...(withPens ? penalties(r) : {}),
        updated_at: new Date().toISOString(),
      });
      written++;
      if (before.get(id) !== status) changed.push(`${id}:${before.get(id)}→${status}`);
    }
  }
  return { requests, written, changed };
}

export default withCron('live', async () => {
  const started = Date.now();
  const api = createClient();
  const leagues = await activeLeagues();
  const byApiId = new Map(leagues.map((l) => [l.api_league_id, l]));

  const json = await api.get('fixtures', { live: 'all' });
  const all = json.response || [];
  const mine = all.filter((r) => byApiId.has(r.league?.id) && keepRound(byApiId.get(r.league.id), r.league?.round));
  // Penalty columns only once a cup is active, i.e. 039 has run (rule 21).
  const withPens = leagues.some(isCupRow);

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
        ...(withPens ? penalties(r) : {}),
        updated_at: new Date().toISOString(),
      });
    }
    rows = await upsert('fixtures', fixtureRows, 'api_fixture_id');
  }

  // ── Finalise what left the feed ──
  const liveIds = new Set(all.map((r) => r.fixture?.id).filter(Boolean));
  let fin = { requests: 0, written: 0, changed: [] }, staleCount = 0;
  try {
    const stale = await staleFixtures(leagues.map((l) => l.id), liveIds);
    staleCount = stale.length;
    if (stale.length) fin = await finalise(api, stale, started, withPens);
  } catch (e) {
    // The live scores above are already written; a failed finalise is retried next run.
    console.error('[live] finalise:', e.message);
    fin.error = e.message.slice(0, 200);
  }

  const s = api.stats();
  return {
    rows_written: rows + fin.written,
    requests_used: s.used,
    quota_remaining: s.remaining,
    live_worldwide: all.length,
    live_in_our_leagues: mine.length,
    stale_found: staleCount,
    finalised: fin.written,
    finalise_requests: fin.requests,
    status_changes: fin.changed,
    ...(fin.error ? { finalise_error: fin.error } : {}),
  };
});
