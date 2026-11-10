// Scout Game scoring tests — base points, multipliers, captain, the 6x cap.
//
//   node tests/scout-game.test.js
//
// No dependencies, like the other tests. Exit code 0 on success, 1 on failure.
//
// The three player-fixture rows are real: they come out of the committed
// API-Football payloads through the same parser the job uses, so these tests
// pin the whole path from payload to points. Every expected value below was
// worked out by hand from the points table in api/_lib/scout-game.js.

import { readFileSync } from 'node:fs';
import { parseFixture } from '../api/_lib/players.js';
import {
  basePoints, scorePick, effectiveMultiplier, pickTotal, tierMultiplier, POINTS,
  TIER_MULTIPLIER, UNRANKED_MULTIPLIER, MAX_MULTIPLIER, CAPTAIN_MODE,
} from '../api/_lib/scout-game.js';

let passed = 0;
const failures = [];
function eq(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) passed++; else failures.push(`${name}\n      got  ${g}\n      want ${w}`);
}
function check(name, ok, detail) {
  if (ok) passed++; else failures.push(detail ? `${name}\n      ${detail}` : name);
}

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const load = (n) => JSON.parse(read(`tests/fixtures/api-football/${n}.json`)).response;
const all = [...load('fixtures_ids_detail'), ...load('fixtures_ids_20')];

/** Parsed row + own goals from the events, for a named player in a fixture. */
function player(fixtureId, name) {
  const fx = all.find((f) => f.fixture.id === fixtureId);
  const p = parseFixture(fx);
  const who = p.players.find((x) => x.name.includes(name));
  const row = p.rows.find((r) => r.api_player_id === who.api_player_id);
  const ownGoals = fx.events.filter((e) => e.type === 'Goal' && e.detail === 'Own Goal'
    && e.player?.id === who.api_player_id).length;
  return { row, ownGoals };
}

// ── the v2 table itself ───────────────────────────────────────────────────
// Agreed 10 Nov: every positive event x1.5 over the proposed table except the
// tackle, goals conceded -0.5. Pinned so a change to it is a deliberate one.
eq('v2 points: goal, assist, clean sheet (G/D/M/F), conceded (G/D)', [
  POINTS.goal.F, POINTS.assist.M, POINTS.clean_sheet.G, POINTS.clean_sheet.D, POINTS.clean_sheet.M,
  POINTS.clean_sheet.F, POINTS.conceded.G, POINTS.conceded.D,
], [12, 7.5, 7.5, 7.5, 0, 0, -0.5, 0]);
eq('v2 points: save, pen saved, tackle, interception, shot on, shot off, key pass, foul drawn', [
  POINTS.save.G, POINTS.pen_saved.G, POINTS.tackle.D, POINTS.interception.D, POINTS.shot_on.F,
  POINTS.shot_off.F, POINTS.key_pass.M, POINTS.foul_drawn.M,
], [1.5, 10.5, 1.2, 1.2, 1.8, 1.2, 1.2, 0.75]);
eq('v2 points: foul committed, own goal, pen missed, pen committed, yellow, red, offside', [
  POINTS.foul_committed.D, POINTS.own_goal.D, POINTS.pen_missed.F, POINTS.pen_committed.D,
  POINTS.yellow.M, POINTS.red.M, POINTS.offside.F,
], [-0.3, -3, -4, -1, -1, -3, -0.1]);
eq('no appearance points: 90 minutes and nothing else scores 0',
  basePoints({ position: 'M', minutes: 90 }).base, 0);

// ── 1. Fábio, GK, 1492449 (won 3-0 away) ──────────────────────────────────
//   clean sheet (G) .......... +7.5
//   5 saves x 1.5 ............ +7.5
//   nothing conceded, no other events
//   base = 15
{
  const { row, ownGoals } = player(1492449, 'Fábio');
  const b = basePoints(row, ownGoals);
  eq('Fábio: base 15', b.base, 15);
  eq('Fábio: breakdown', b.breakdown, {
    clean_sheet: { count: 1, points: 7.5 }, saves: { count: 5, points: 7.5 },
  });
  eq('Fábio as a tier-2 captain (1.2x +1 additive = 2.2x): 15 x 2.2 = 33',
    scorePick(row, { locked_multiplier: TIER_MULTIPLIER[2], is_captain: true }, { ownGoals }).total, 33);
  eq('Fábio as a tier-5 pick, no captain: 15 x 1 = 15',
    scorePick(row, { locked_multiplier: TIER_MULTIPLIER[5], is_captain: false }, { ownGoals }).total, 15);
}

// ── 2. Kaio Jorge, F, 1492402 (lost 4-2; he scored an own goal) ───────────
//   1 assist ................. +7.5
//   3 shots, all on target x 1.8 ... +5.4 (0 off target)
//   2 key passes x 1.2 ....... +2.4
//   2 fouls drawn x 0.75 ..... +1.5
//   1 offside ................ -0.1
//   1 own goal ............... -3
//   4 conceded score nothing for an F
//   base = 13.7
{
  const { row, ownGoals } = player(1492402, 'Kaio Jorge');
  eq('Kaio Jorge: one own goal found in the events', ownGoals, 1);
  const b = basePoints(row, ownGoals);
  eq('Kaio Jorge: base 13.7', b.base, 13.7);
  eq('Kaio Jorge: breakdown', b.breakdown, {
    assists: { count: 1, points: 7.5 }, shots_on: { count: 3, points: 5.4 }, key_passes: { count: 2, points: 2.4 },
    fouls_drawn: { count: 2, points: 1.5 }, offsides: { count: 1, points: -0.1 }, own_goals: { count: 1, points: -3 },
  });
  eq('Kaio Jorge unranked (1.4x): 13.7 x 1.4 = 19.18',
    scorePick(row, { locked_multiplier: null, locked_tier: null, is_captain: false }, { ownGoals }).total, 19.18);
}

// ── 3. Kannemann, D, 1492416 (yellow, then sent off at 73') ───────────────
//   1 tackle ................. +1.2
//   5 fouls committed x -0.3 . -1.5
//   red card (replaces the yellow) ... -3
//   3 conceded score nothing for a D
//   base = -3.3: negative, so unscaled whatever the multiplier
{
  const { row, ownGoals } = player(1492416, 'Kannemann');
  const b = basePoints(row, ownGoals);
  eq('Kannemann: base -3.3', b.base, -3.3);
  check('Kannemann: the red replaces the yellow', b.breakdown.red && !b.breakdown.yellow, JSON.stringify(b.breakdown));
  eq('Kannemann as a tier-1 contrarian captain: still -3.3, never scaled',
    scorePick(row, { locked_multiplier: TIER_MULTIPLIER[1], is_captain: true, locked_contrarian: true }, { ownGoals }).total, -3.3);
}

// ── a reduced-feed row: penalty fields null -> 0, never NaN ───────────────
//   Roefs, GK, 1557466 (won 1-0): clean sheet +7.5, 4 saves x 1.5 = +6,
//   1 foul drawn +0.75 -> 14.25. A quarter: why base_points has 2 decimals (022).
{
  const { row, ownGoals } = player(1557466, 'Roefs');
  check('Roefs: pen_saved arrives null (reduced feed)', row.pen_saved === null);
  check('Roefs: pen_committed arrives null (reduced feed)', row.pen_committed === null);
  eq('Roefs: base 14.25', basePoints(row, ownGoals).base, 14.25);
}

// ── multipliers ───────────────────────────────────────────────────────────
eq('ladder (half compensation from the v2 points): tier 5 -> 1x ... tier 1 -> 1.4x',
  [5, 4, 3, 2, 1].map((t) => TIER_MULTIPLIER[t]), [1, 1.05, 1.1, 1.2, 1.4]);
eq('unranked default 1.4x, paid like tier 1',
  [tierMultiplier(null), tierMultiplier(undefined), UNRANKED_MULTIPLIER], [1.4, 1.4, 1.4]);
check('the ladder rises from tier 5 to tier 1',
  [5, 4, 3, 2, 1].every((t, i, a) => i === 0 || TIER_MULTIPLIER[t] > TIER_MULTIPLIER[a[i - 1]]));
eq('the default captain mode is additive', CAPTAIN_MODE, 'additive');
eq('additive: tier 4 captain 1.05 + 1 -> 2.05x', effectiveMultiplier({ tierMult: TIER_MULTIPLIER[4], captain: true }), 2.05);
eq('additive: the most any pick can reach today, tier 1 captain contrarian 1.4 + 1 + 0.5 -> 2.9x',
  effectiveMultiplier({ tierMult: TIER_MULTIPLIER[1], captain: true, contrarian: true }), 2.9);
// The 6x cap is a rule that binds any future ladder, so it is tested with
// values the current ladder cannot produce.
eq('cap: 5 + 1 + 0.5 additive -> capped at 6x', effectiveMultiplier({ tierMult: 5, captain: true, contrarian: true }), 6);
eq('cap: multiplicative 4 x 2 -> capped at 6x', effectiveMultiplier({ tierMult: 4, captain: true, mode: 'multiplicative' }), 6);
eq('multiplicative: tier 2 captain 1.2 x 2 -> 2.4x', effectiveMultiplier({ tierMult: TIER_MULTIPLIER[2], captain: true, mode: 'multiplicative' }), 2.4);
eq('the cap is 6x', MAX_MULTIPLIER, 6);
eq('a zero base stays zero', pickTotal(0, 6), 0);
eq('a positive base is multiplied', pickTotal(4.5, 2), 9);

// ── the job's game steps, with Supabase stubbed ──────────────────────────
// No network: fetch answers from memory. Checks the order of the steps, that
// the ladder written to game_config is the one in scout-game.js, and that the
// room post runs after the results.
{
  process.env.SUPABASE_URL = 'https://stub.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_stub';
  const calls = [];
  let configWrite = null;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const path = new URL(url).pathname.replace('/rest/v1/', '');
    calls.push(`${init.method || 'GET'} ${path}`);
    if (path === 'game_config' && init.method === 'PATCH') configWrite = JSON.parse(init.body);
    const body = path === 'rpc/lock_due_rounds' ? [] : path.startsWith('rpc/') ? 0 : null;
    return new Response(body === null ? null : JSON.stringify(body),
      { status: body === null ? 204 : 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const { runScoutGame } = await import('../api/cron/player-stats.js');
    const out = await runScoutGame([]);
    eq('job: game steps in order', calls, [
      'PATCH game_config', 'POST rpc/sync_game_rounds', 'POST rpc/lock_due_rounds',
      'POST rpc/refresh_game_results', 'POST rpc/post_round_messages',
    ]);
    eq('job: game_config gets the ladder from scout-game.js',
      [configWrite?.ladder, configWrite?.unranked_multiplier, configWrite?.captain_mode, configWrite?.max_multiplier],
      [TIER_MULTIPLIER, UNRANKED_MULTIPLIER, 'additive', MAX_MULTIPLIER]);
    check('job: no error reported', !out.error, out.error);
  } finally {
    globalThis.fetch = realFetch;
  }
}

// ── every breakdown key has a label on the Scout tab ─────────────────────
// A row with every event once (GK, so the clean sheet and conceded score too;
// a second row for the red, which replaces the yellow).
{
  const one = { minutes: 90, goals: 1, assists: 1, clean_sheet: true, goals_conceded: 1, saves: 1, pen_saved: 1,
    tackles: 1, interceptions: 1, shots_total: 2, shots_on: 1, passes_key: 1, fouls_drawn: 1, fouls_committed: 1,
    offsides: 1, pen_missed: 1, pen_committed: 1, yellow: 1, red: 0 };
  const keys = new Set([
    ...Object.keys(basePoints({ ...one, position: 'G' }, 1).breakdown),
    ...Object.keys(basePoints({ ...one, position: 'G', red: 1 }, 0).breakdown),
  ]);
  const block = /const SG_BREAKDOWN_LABEL=\{([\s\S]*?)\};/.exec(read('public/index.html'));
  const labelled = new Set(block ? [...block[1].matchAll(/(\w+):'/g)].map((m) => m[1]) : []);
  eq('breakdown keys without a label in index.html', [...keys].filter((k) => !labelled.has(k)), []);
  eq('labels in index.html for keys basePoints() never writes', [...labelled].filter((k) => !keys.has(k)), []);
}

// ── no money language in the game's code ─────────────────────────────────
{
  const word = ['od', 'ds'].join('');   // spelt this way so this file passes its own check
  const files = ['api/_lib/scout-game.js', 'api/cron/player-stats.js', 'supabase/migrations/017_scout_game.sql',
    'supabase/migrations/018_scout_game_ladder.sql', 'supabase/migrations/019_scout_game_reads.sql',
    'supabase/migrations/020_lineup_rule.sql', 'supabase/migrations/021_pickable_fixture.sql',
    'supabase/migrations/022_base_points_precision.sql', 'scripts/backtest-scout-game.mjs',
    'supabase/migrations/023_formation_and_history.sql', 'supabase/migrations/024_account_deletion.sql',
    'api/account/delete.js',
    'public/index.html'];   // the Scout tab's copy lives here since Day 4
  // Money words, spelt in pieces so this file passes its own check.
  const banned = [word, ['b', 'et'].join(''), ['win', ' money'].join('')];
  const hits = [];
  for (const f of files) for (const w of banned) if (new RegExp(`\\b${w}\\b`, 'i').test(read(f))) hits.push(`${f}: ${w}`);
  eq('no money language in any game file', hits, []);
}

for (const f of failures) console.log(`  FAIL  ${f}`);
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
