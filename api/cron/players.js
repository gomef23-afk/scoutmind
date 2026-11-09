// R6 — player bios: name, age, birth date, nationality, height, weight, photo.
//
// Source: /players?league&season&page, 20 players a page. The 2026 page counts
// are 44 / 27 / 31 / 24 / 33 / 25 / 61 for our seven leagues: 245 requests for
// a full pass. /players/squads is cheaper (1 per team) but carries no
// nationality, height or birth date, so it cannot fill this table.
//
// The statistics this endpoint returns are IGNORED. Season stats are summed
// from player_fixture_stats by refresh_player_season_stats(); the per-fixture
// data is what the Scout Game scores, and it is more complete.
//
// Pacing: up to MAX_PAGES pages or TIME_BUDGET_MS per run, resuming from
// ingest_runs.cursor = { league_id, page, cycle_started_at }. After the last
// page of the last league the cycle is complete, and runs do nothing (zero
// requests) until REFRESH_DAYS have passed. So: 245 requests once, then about
// 245 a week, which averages ~35 a day.
//
// Players created by player-stats from a fixture (id, name, photo only) get
// their bio the next time this job reaches their league's page.

import { createClient, cmToNumber } from '../_lib/apifootball.js';
import { select, upsert, activeLeagues } from '../_lib/supabase.js';
import { withCron } from '../_lib/cron.js';
import { bioRow } from '../_lib/players.js';

const MAX_PAGES = 15;
const TIME_BUDGET_MS = 20_000;
const REFRESH_DAYS = 7;

export default withCron('players', async () => {
  const api = createClient();
  const started = Date.now();

  const leagues = (await activeLeagues()).sort((a, b) => a.id - b.id);
  if (!leagues.length) return { rows_written: 0, requests_used: 0, note: 'no active leagues' };

  // The last cursor a SUCCESSFUL run saved. withCron writes it only on success,
  // so a run that failed halfway is simply retried from where the last good one
  // stopped.
  const last = await select(
    'ingest_runs',
    'select=cursor&job=eq.players&ok=is.true&cursor=not.is.null&order=started_at.desc&limit=1'
  );
  let cursor = last[0]?.cursor || null;

  // A finished cycle waits REFRESH_DAYS before the next one starts.
  if (cursor?.complete_at) {
    const ageDays = (Date.now() - new Date(cursor.complete_at).getTime()) / 86_400_000;
    if (ageDays < REFRESH_DAYS) {
      return { rows_written: 0, requests_used: 0, note: 'cycle complete, waiting', cursor };
    }
    cursor = null;
  }
  if (!cursor) {
    cursor = { league_id: leagues[0].id, page: 1, cycle_started_at: new Date().toISOString() };
  }

  let idx = leagues.findIndex((l) => l.id === cursor.league_id);
  let page = Number.isInteger(cursor.page) && cursor.page > 0 ? cursor.page : 1;
  if (idx < 0) { idx = 0; page = 1; }   // the league was deactivated; start the pass again

  let rows = 0;
  let pages = 0;
  let stoppedOnClock = false;

  while (pages < MAX_PAGES) {
    if (Date.now() - started > TIME_BUDGET_MS) { stoppedOnClock = true; break; }
    if (api.lowQuota(5)) break;

    const lg = leagues[idx];
    const json = await api.get('players', { league: lg.api_league_id, season: lg.current_season, page });
    pages++;

    // A player can appear twice on one page (two clubs in a season); one row
    // each, or the upsert fails with "cannot affect row a second time".
    const byId = new Map();
    for (const entry of json.response || []) {
      if (!entry.player?.id) continue;
      byId.set(entry.player.id, bioRow(entry, cmToNumber));
    }
    rows += await upsert('players', [...byId.values()], 'api_player_id');

    const total = json.paging?.total ?? page;
    if (page < total) {
      page++;
    } else if (idx < leagues.length - 1) {
      idx++;
      page = 1;
    } else {
      // Every league done: this cycle is complete.
      cursor = { ...cursor, league_id: leagues[0].id, page: 1, complete_at: new Date().toISOString() };
      const s = api.stats();
      return { rows_written: rows, requests_used: s.used, quota_remaining: s.remaining,
        pages, note: 'cycle complete', cursor };
    }
  }

  cursor = { ...cursor, league_id: leagues[idx].id, page };
  const s = api.stats();
  return {
    rows_written: rows,
    requests_used: s.used,
    quota_remaining: s.remaining,
    pages,
    stopped_on: stoppedOnClock ? 'time_budget' : 'page_limit',
    elapsed_ms: Date.now() - started,
    cursor,
  };
});
