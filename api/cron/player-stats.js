// R6 — per-player, per-fixture statistics, plus the event timeline.
//
// ONE job covers the backfill and steady state, like fixture-stats. It drains
// a bounded batch per run and exits: ~23 runs at 15-minute spacing clear the
// 1,334-fixture backlog, then it absorbs the fixtures that finish each day and
// costs nothing on an empty queue.
//
// Cost: 1 API request per 20 fixtures. /fixtures?ids= takes up to 20 ids
// (confirmed: tests/fixtures/api-football/fixtures_ids_20.json) and returns
// each fixture with its players, events and lineups. Its players block is
// byte-identical to /fixtures/players, which would cost 1 request per fixture.
//
// Sizing: TWO limits, whichever hits first — MAX_FIXTURES and a wall-clock
// budget, checked before every request. cron-job.org stops waiting at 30s.
//
// Resumable by construction: the queue lives in columns on `fixtures`, so a run
// that dies mid-batch leaves the unfinished fixtures queued for the next one.
// Each chunk of 20 is written completely, season rows included, before the
// next chunk is fetched.

import { createClient } from '../_lib/apifootball.js';
import { select, upsert, update, rpc, activeLeagues, teamIdMap, count } from '../_lib/supabase.js';
import { withCron } from '../_lib/cron.js';
import { parseFixture } from '../_lib/players.js';

const FINISHED = ['FT', 'AET', 'PEN'];

const IDS_PER_REQUEST = 20;     // the API's limit for /fixtures?ids=
const MAX_FIXTURES = 60;        // 3 requests per run
const TIME_BUDGET_MS = 20_000;  // stop STARTING requests at 20s; target <25s
const MAX_ATTEMPTS = 3;
const MIN_AGE_HOURS = 3;        // player stats are not published at the whistle
const RETRY_AFTER_HOURS = [2, 24];

export default withCron('player-stats', async ({ req }) => {
  const api = createClient();
  const url = new URL(req.url, 'http://localhost');
  const limit = Math.min(Number(url.searchParams.get('limit') ?? MAX_FIXTURES), 200);
  const started = Date.now();

  const leagues = await activeLeagues();
  const teams = await teamIdMap(leagues.map((l) => l.id));

  // ── Work queue ───────────────────────────────────────────────────────────
  const cutoff = new Date(Date.now() - MIN_AGE_HOURS * 3600_000).toISOString();
  const nowIso = new Date().toISOString();
  const queueFilter = [
    `status_short=in.(${FINISHED.join(',')})`,
    `league_id=in.(${leagues.map((l) => l.id).join(',')})`,
    'players_fetched_at=is.null',
    `players_attempts=lt.${MAX_ATTEMPTS}`,
    `kickoff_utc=lte.${cutoff}`,
    `or=(players_retry_after.is.null,players_retry_after.lte.${nowIso})`,
  ].join('&');

  const queue = await select(
    'fixtures',
    `select=id,api_fixture_id,season,players_attempts&${queueFilter}&order=kickoff_utc.asc&limit=${limit}`
  );

  let requests = 0;
  let ingested = 0;
  let emptyCount = 0;
  let playerRows = 0;
  let eventRows = 0;
  let unidentified = 0;
  let unmappedTeams = 0;
  let stoppedOnClock = false;
  const goalMismatches = [];

  for (let i = 0; i < queue.length; i += IDS_PER_REQUEST) {
    if (Date.now() - started > TIME_BUDGET_MS) { stoppedOnClock = true; break; }
    if (api.lowQuota(5)) break;

    const chunk = queue.slice(i, i + IDS_PER_REQUEST);
    let json;
    try {
      json = await api.get('fixtures', { ids: chunk.map((f) => f.api_fixture_id).join('-') });
      requests++;
    } catch (e) {
      // One bad request must not abort the run, and must not retry forever.
      console.warn(`[player-stats] ids request failed: ${e.message}`);
      for (const fx of chunk) await recordAttempt(fx, 'error');
      continue;
    }

    const byApiId = new Map((json.response || []).map((r) => [r.fixture?.id, r]));
    const done = [];
    const fxPlayers = new Map();   // api_player_id -> { name, photo_url }
    const parsed = [];

    for (const fx of chunk) {
      const r = byApiId.get(fx.api_fixture_id);
      // Missing from the response, or no players yet: back off, like an empty
      // /fixtures/statistics response in fixture-stats.
      if (!r || !(r.players || []).length) {
        emptyCount++;
        await recordAttempt(fx, r ? 'empty' : 'missing');
        continue;
      }
      const p = parseFixture(r);
      if (!p.goalCheck.ok) {
        // Not an error: conceded and clean sheet stay null for this fixture.
        goalMismatches.push(fx.api_fixture_id);
        console.warn(`[player-stats] goal events do not match the score, fixture=${fx.api_fixture_id} ` +
          `events=${JSON.stringify(p.goalCheck.events)} score=${JSON.stringify(p.goalCheck.score)}`);
      }
      unidentified += p.unidentified;
      for (const pl of p.players) fxPlayers.set(pl.api_player_id, pl);
      parsed.push({ fx, p });
    }
    if (!parsed.length) continue;

    // ── players: create the ones we have never seen ────────────────────────
    // Insert-only. The bio job (/api/cron/players) owns name, photo and bio,
    // so a fixture's abbreviated name never overwrites a fuller one.
    const apiIds = [...fxPlayers.keys()];
    await upsert(
      'players',
      apiIds.map((id) => ({ api_player_id: id, name: fxPlayers.get(id).name, photo_url: fxPlayers.get(id).photo_url })),
      'api_player_id',
      { ignoreDuplicates: true }
    );
    const playerId = new Map();
    for (let k = 0; k < apiIds.length; k += 200) {
      const rows = await select('players', `select=id,api_player_id&api_player_id=in.(${apiIds.slice(k, k + 200).join(',')})`);
      for (const r of rows) playerId.set(r.api_player_id, r.id);
    }

    // ── rows and events ────────────────────────────────────────────────────
    const statRows = [];
    const evRows = [];
    for (const { fx, p } of parsed) {
      for (const row of p.rows) {
        const teamId = teams.get(row.api_team_id);
        const pid = playerId.get(row.api_player_id);
        if (!teamId || !pid) { unmappedTeams++; continue; }
        const { api_player_id, api_team_id, ...stats } = row;
        statRows.push({ fixture_id: fx.id, player_id: pid, team_id: teamId, season: fx.season, ...stats,
          updated_at: new Date().toISOString() });
      }
      for (const e of p.events) {
        const { api_team_id, ...rest } = e;
        evRows.push({ fixture_id: fx.id, team_id: teams.get(api_team_id) ?? null, ...rest });
      }
      done.push({ fx, unidentified: p.unidentified });
    }

    playerRows += await upsert('player_fixture_stats', statRows, 'fixture_id,player_id');
    eventRows += await upsert('fixture_events', evRows, 'fixture_id,seq');

    // Marked done only after its rows are written. One PATCH per distinct
    // (attempts, unidentified) pair, not one per fixture.
    const groups = new Map();
    for (const d of done) {
      const key = `${(d.fx.players_attempts ?? 0) + 1}:${d.unidentified}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(d.fx.id);
    }
    for (const [key, ids] of groups) {
      const [attempts, unid] = key.split(':').map(Number);
      await update('fixtures', `id=in.(${ids.join(',')})`, {
        players_fetched_at: new Date().toISOString(),
        players_attempts: attempts,
        players_last_attempt: new Date().toISOString(),
        players_retry_after: null,
        players_unidentified: unid,
      });
    }
    ingested += done.length;

    // Season rows and team derivations, recomputed from scratch for everyone
    // these fixtures touched, inside the database.
    const fixtureIds = done.map((d) => d.fx.id);
    await rpc('refresh_player_season_stats', { p_fixture_ids: fixtureIds });
    await rpc('refresh_team_player_stats', { p_fixture_ids: fixtureIds });
  }

  const backlog = await count('fixtures', queueFilter);
  const s = api.stats();

  return {
    rows_written: playerRows,
    requests_used: s.used,
    quota_remaining: s.remaining,
    queued: queue.length,
    fixtures_ingested: ingested,
    empty_responses: emptyCount,
    event_rows: eventRows,
    unidentified_players: unidentified,
    unmapped_rows: unmappedTeams,
    goal_mismatches: goalMismatches,
    backlog_remaining: backlog,
    stopped_on: stoppedOnClock
      ? 'time_budget'
      : queue.length < limit ? 'queue_empty' : 'batch_limit',
    elapsed_ms: Date.now() - started,
    cursor: { backlog_remaining: backlog, requests },
  };

  async function recordAttempt(fx, reason) {
    const attempts = (fx.players_attempts ?? 0) + 1;
    const hours = RETRY_AFTER_HOURS[attempts - 1];
    await update('fixtures', `id=eq.${fx.id}`, {
      players_attempts: attempts,
      players_last_attempt: new Date().toISOString(),
      players_retry_after: hours ? new Date(Date.now() + hours * 3600_000).toISOString() : null,
    });
    console.log(`[player-stats] ${reason} fixture=${fx.api_fixture_id} attempt=${attempts}`);
  }
});
