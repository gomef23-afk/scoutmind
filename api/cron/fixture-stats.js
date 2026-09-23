// R5 — fixture statistics ingest + team season aggregates.
//
// ONE job covers both the backfill and steady state. It drains a bounded batch
// per run and exits, so ~19 runs at 15-minute spacing clear the ~728-fixture
// backlog in roughly 5 hours with no manual looping. Afterwards the same job
// absorbs the ~20-40 fixtures that finish each day and costs nothing on an
// empty queue.
//
// Cost: 1 API request per fixture. Zero when the queue is empty.
//
// Sizing: TWO limits, whichever hits first — MAX_FIXTURES and a wall-clock
// budget. The clock matters more: cron-job.org stops waiting at 30s, and a
// fixed count would overshoot whenever the API is slow. Vercel Fluid Compute
// allows well over 30s, so an overrun would not fail, but the caller would have
// already given up and the run would look like a timeout.

import { createClient, pctToNumber, statsArrayToObject } from '../_lib/apifootball.js';
import { select, upsert, update, activeLeagues, teamIdMap, count } from '../_lib/supabase.js';
import { withCron } from '../_lib/cron.js';

const FINISHED = ['FT', 'AET', 'PEN'];

const MAX_FIXTURES = 40;        // ~160 req/min, well under the 300/min ceiling
const TIME_BUDGET_MS = 20_000;  // stop STARTING work at 20s; target <25s total
const MAX_ATTEMPTS = 3;
const MIN_AGE_HOURS = 3;        // stats are not published the instant a match ends
const RETRY_AFTER_HOURS = [2, 24]; // backoff after attempt 1, then attempt 2

export default withCron('fixture-stats', async ({ req }) => {
  const api = createClient();
  const url = new URL(req.url, 'http://localhost');
  const limit = Math.min(Number(url.searchParams.get('limit') ?? MAX_FIXTURES), 200);
  const started = Date.now();

  const leagues = await activeLeagues();
  const coverage = await ensureCoverage(api, leagues);

  // stats_coverage === false means the competition publishes no fixture
  // statistics. Null means "not checked yet" and is treated as eligible.
  const eligible = leagues.filter((l) => l.stats_coverage !== false);
  if (!eligible.length) {
    return {
      rows_written: 0,
      requests_used: api.stats().used,
      note: 'no active league has statistics coverage',
      coverage,
    };
  }
  const eligibleIds = eligible.map((l) => l.id);

  // API team id -> our teams.id, for every active league. One query.
  const teams = await teamIdMap(leagues.map((l) => l.id));

  // ── Work queue ───────────────────────────────────────────────────────────
  // Finished, at least MIN_AGE_HOURS old, not yet fetched, attempts not
  // exhausted, past its backoff. Oldest first so the backfill drains in order.
  const cutoff = new Date(Date.now() - MIN_AGE_HOURS * 3600_000).toISOString();
  const nowIso = new Date().toISOString();
  const queueFilter = [
    `status_short=in.(${FINISHED.join(',')})`,
    `league_id=in.(${eligibleIds.join(',')})`,
    'stats_fetched_at=is.null',
    `stats_attempts=lt.${MAX_ATTEMPTS}`,
    `kickoff_utc=lte.${cutoff}`,
    `or=(stats_retry_after.is.null,stats_retry_after.lte.${nowIso})`,
  ].join('&');

  const queue = await select(
    'fixtures',
    `select=id,api_fixture_id,league_id,season,home_team_id,away_team_id,stats_attempts&${queueFilter}&order=kickoff_utc.asc&limit=${limit}`
  );

  let ingested = 0;
  let emptyCount = 0;
  let statRows = 0;
  let stoppedOnClock = false;
  const touched = new Map(); // teamId -> season

  for (const fx of queue) {
    if (Date.now() - started > TIME_BUDGET_MS) { stoppedOnClock = true; break; }
    if (api.lowQuota(5)) break;

    let json;
    try {
      json = await api.get('fixtures/statistics', { fixture: fx.api_fixture_id });
    } catch (e) {
      // One bad fixture must not abort the batch.
      console.warn(`[fixture-stats] fixture ${fx.api_fixture_id}: ${e.message}`);
      await recordAttempt(fx, 'error');
      continue;
    }

    const rows = [];
    for (const side of json.response || []) {
      const localId = teams.get(side.team?.id);
      if (!localId) continue;
      rows.push(mapStats(fx.id, localId, side.statistics));
    }

    // [] happens legitimately: stats not published yet. Back off, do not retry
    // forever. `unmapped` means the teams are not in our teams table — running
    // /api/cron/teams fixes that, and the backoff stops us hammering meanwhile.
    if (!rows.length) {
      emptyCount++;
      await recordAttempt(fx, (json.response || []).length ? 'unmapped' : 'empty');
      continue;
    }

    statRows += await upsert('fixture_stats', rows, 'fixture_id,team_id');
    await update('fixtures', `id=eq.${fx.id}`, {
      stats_fetched_at: new Date().toISOString(),
      stats_attempts: (fx.stats_attempts ?? 0) + 1,
      stats_last_attempt: new Date().toISOString(),
      stats_retry_after: null,
    });
    ingested++;

    if (fx.home_team_id) touched.set(fx.home_team_id, fx.season);
    if (fx.away_team_id) touched.set(fx.away_team_id, fx.season);
  }

  // Recomputed from scratch off fixture_stats, never incremented, so
  // re-running cannot double count.
  const aggregated = await aggregateTeams(touched, leagues);

  const backlog = await count('fixtures', queueFilter);
  const s = api.stats();

  return {
    rows_written: statRows,
    requests_used: s.used,
    quota_remaining: s.remaining,
    queued: queue.length,
    fixtures_ingested: ingested,
    empty_responses: emptyCount,
    teams_aggregated: aggregated,
    backlog_remaining: backlog,
    stopped_on: stoppedOnClock
      ? 'time_budget'
      : queue.length < limit ? 'queue_empty' : 'batch_limit',
    elapsed_ms: Date.now() - started,
    coverage,
  };

  async function recordAttempt(fx, reason) {
    const attempts = (fx.stats_attempts ?? 0) + 1;
    // First empty -> +2h, second -> +24h, third -> retired by the
    // stats_attempts < MAX_ATTEMPTS filter.
    const hours = RETRY_AFTER_HOURS[attempts - 1];
    await update('fixtures', `id=eq.${fx.id}`, {
      stats_attempts: attempts,
      stats_last_attempt: new Date().toISOString(),
      stats_retry_after: hours ? new Date(Date.now() + hours * 3600_000).toISOString() : null,
    });
    console.log(`[fixture-stats] ${reason} fixture=${fx.api_fixture_id} attempt=${attempts}`);
  }
});

// ── coverage ───────────────────────────────────────────────────────────────
// coverage.fixtures.statistics_fixtures, cached on `leagues`. Checked once per
// league; a competition without coverage would otherwise burn one wasted
// request per fixture, forever.
async function ensureCoverage(api, leagues) {
  const report = {};
  for (const lg of leagues) {
    if (lg.stats_coverage !== null && lg.stats_coverage !== undefined) {
      report[lg.slug] = lg.stats_coverage;
      continue;
    }
    try {
      const json = await api.get('leagues', { id: lg.api_league_id });
      const seasons = json.response?.[0]?.seasons || [];
      const season = seasons.find((s) => s.year === lg.current_season);
      const has = season?.coverage?.fixtures?.statistics_fixtures === true;
      await update('leagues', `id=eq.${lg.id}`, { stats_coverage: has });
      lg.stats_coverage = has;
      report[lg.slug] = has;
      if (!has) {
        console.warn(`[fixture-stats] ${lg.slug} season ${lg.current_season} has NO statistics coverage — skipping`);
      }
    } catch (e) {
      console.warn(`[fixture-stats] coverage check failed for ${lg.slug}: ${e.message}`);
      report[lg.slug] = 'check_failed';
    }
  }
  return report;
}

// ── aggregation ────────────────────────────────────────────────────────────
// Three denominators, documented in migration 004:
//   matches          games played          -> gs, gc
//   fixtures_sampled games with stats      -> pa, pos_pct, sh_pg, sot_pg, fouls_pg, yel_pg
//   xg_sample        games with non-null xG -> xg_pg, xga_pg
async function aggregateTeams(touched, leagues) {
  if (!touched.size) return 0;

  const leagueOf = new Map(leagues.map((l) => [l.id, l]));
  const teamIds = [...touched.keys()];

  // 1. Every finished fixture for these teams, in the seasons we touched.
  const seasons = [...new Set([...touched.values()])];
  const fixtures = await select(
    'fixtures',
    `select=id,league_id,season,home_team_id,away_team_id,home_goals,away_goals` +
      `&status_short=in.(${FINISHED.join(',')})` +
      `&season=in.(${seasons.join(',')})` +
      `&or=(home_team_id.in.(${teamIds.join(',')}),away_team_id.in.(${teamIds.join(',')}))` +
      `&limit=5000`
  );

  // 2. Stats for those fixtures, BOTH sides — the opponent's row is what
  //    gives us xga. Chunked so the `in.()` list never overruns the URL.
  const fixtureIds = fixtures.map((f) => f.id);
  const statsByFixture = new Map();
  for (let i = 0; i < fixtureIds.length; i += 300) {
    const slice = fixtureIds.slice(i, i + 300);
    if (!slice.length) continue;
    const rows = await select(
      'fixture_stats',
      `select=fixture_id,team_id,shots_total,shots_on,fouls,yellow,possession_pct,passes_pct,expected_goals,goals_prevented&fixture_id=in.(${slice.join(',')})&limit=5000`
    );
    for (const r of rows) {
      if (!statsByFixture.has(r.fixture_id)) statsByFixture.set(r.fixture_id, []);
      statsByFixture.get(r.fixture_id).push(r);
    }
  }

  const out = [];
  for (const [teamId, season] of touched) {
    const mine = fixtures.filter(
      (f) => f.season === season && (f.home_team_id === teamId || f.away_team_id === teamId)
    );
    if (!mine.length) continue;
    out.push(computeTeamRow(teamId, season, mine, statsByFixture));
  }

  return upsert('team_season_stats', out, 'team_id,season');
}

/**
 * Pure: one team's season row from its fixtures plus a fixture_id -> [rows] map.
 * Exported so the denominator rules can be tested without a database.
 */
export function computeTeamRow(teamId, season, mine, statsByFixture) {
  let gf = 0, ga = 0, cleanSheets = 0, failedToScore = 0;
  const acc = { sh: 0, sot: 0, fouls: 0, yel: 0, pos: 0, pa: 0, n: 0 };
  const xg = { for: 0, against: 0, n: 0 };
  let gpTotal = 0, gpN = 0;
  let leagueId = null;

  const present = (v) => v !== null && v !== undefined;

  for (const f of mine) {
    leagueId = f.league_id;
    const isHome = f.home_team_id === teamId;
    const forGoals = isHome ? f.home_goals : f.away_goals;
    const agGoals = isHome ? f.away_goals : f.home_goals;
    gf += forGoals ?? 0;
    ga += agGoals ?? 0;
    if ((agGoals ?? 0) === 0) cleanSheets++;
    if ((forGoals ?? 0) === 0) failedToScore++;

    const sides = statsByFixture.get(f.id) || [];
    const ours = sides.find((r) => r.team_id === teamId);
    const theirs = sides.find((r) => r.team_id !== teamId);

    if (ours) {
      acc.sh += ours.shots_total ?? 0;
      acc.sot += ours.shots_on ?? 0;
      acc.fouls += ours.fouls ?? 0;
      acc.yel += ours.yellow ?? 0;
      acc.pos += Number(ours.possession_pct ?? 0);
      acc.pa += Number(ours.passes_pct ?? 0);
      acc.n++;
      if (present(ours.goals_prevented)) { gpTotal += Number(ours.goals_prevented); gpN++; }
    }
    // xG counts only when BOTH sides published it, so xg_pg and xga_pg share
    // one honest denominator instead of drifting apart.
    if (ours && theirs && present(ours.expected_goals) && present(theirs.expected_goals)) {
      xg.for += Number(ours.expected_goals);
      xg.against += Number(theirs.expected_goals);
      xg.n++;
    }
  }

  const m = mine.length;
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const r2 = (v) => Math.round(v * 100) / 100;

  return {
    team_id: teamId,
    league_id: leagueId,
    season,
    matches: m,                       // denominator for gs/gc
    gs: r3(gf / m),
    gc: r3(ga / m),
    clean_sheets: cleanSheets,
    failed_to_score: failedToScore,
    fixtures_sampled: acc.n,          // denominator for the stats block
    sh_pg: acc.n ? r3(acc.sh / acc.n) : null,
    sot_pg: acc.n ? r3(acc.sot / acc.n) : null,
    fouls_pg: acc.n ? r3(acc.fouls / acc.n) : null,
    yel_pg: acc.n ? r3(acc.yel / acc.n) : null,
    pos_pct: acc.n ? r2(acc.pos / acc.n) : null,
    pa: acc.n ? r2(acc.pa / acc.n) : null,
    xg_sample: xg.n,                  // denominator for xg_pg/xga_pg
    xg_pg: xg.n ? r3(xg.for / xg.n) : null,
    xga_pg: xg.n ? r3(xg.against / xg.n) : null,
    goals_prevented: gpN ? r3(gpTotal) : null,
    // tk_pg, int_pg, duels_won_pct come from player data in R6. Deliberately
    // left unset so a partial value never masquerades as real.
    updated_at: new Date().toISOString(),
  };
}

/** Flattens one team's statistics array into a fixture_stats row. */
function mapStats(fixtureId, teamId, statistics) {
  const s = statsArrayToObject(statistics);

  // Counting stats: null means "none happened" -> 0. Leaving them null would
  // make every per-game average silently wrong.
  const n = (v) => (v === null || v === undefined ? 0 : Number(v));
  // xG / goals_prevented: null means NOT AVAILABLE -> stay null, so the
  // aggregate excludes the fixture instead of averaging in a zero.
  const f = (v) => {
    if (v === null || v === undefined || v === '') return null;
    const x = parseFloat(v);
    return Number.isFinite(x) ? x : null;
  };

  return {
    fixture_id: fixtureId,
    team_id: teamId,
    shots_on: n(s['Shots on Goal']),
    shots_off: n(s['Shots off Goal']),
    shots_total: n(s['Total Shots']),
    shots_blocked: n(s['Blocked Shots']),
    shots_inside: n(s['Shots insidebox']),
    shots_outside: n(s['Shots outsidebox']),
    fouls: n(s['Fouls']),
    corners: n(s['Corner Kicks']),
    offsides: n(s['Offsides']),
    possession_pct: pctToNumber(s['Ball Possession']),
    yellow: n(s['Yellow Cards']),
    red: n(s['Red Cards']),
    gk_saves: n(s['Goalkeeper Saves']),
    passes_total: n(s['Total passes']),
    passes_accurate: n(s['Passes accurate']),
    passes_pct: pctToNumber(s['Passes %']),
    // snake_case, unlike the sixteen above. Match the exact string.
    expected_goals: f(s['expected_goals']),
    goals_prevented: f(s['goals_prevented']),
  };
}
