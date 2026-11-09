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
  basePoints, scorePick, effectiveMultiplier, pickTotal, tierMultiplier,
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

// ── 1. Fábio, GK, 1492449 (won 3-0 away) ──────────────────────────────────
//   90 min .................. +2
//   clean sheet (G) ......... +4
//   5 saves -> 1 lot of 3 ... +1
//   no shots/key passes for a G; no cards
//   base = 7
{
  const { row, ownGoals } = player(1492449, 'Fábio');
  const b = basePoints(row, ownGoals);
  eq('Fábio: base 7', b.base, 7);
  eq('Fábio: breakdown', b.breakdown, {
    minutes: { count: 90, points: 2 }, clean_sheet: { count: 1, points: 4 }, saves: { count: 5, points: 1 },
  });
  eq('Fábio as a tier-2 captain (1.2x +1 additive = 2.2x): 7 x 2.2 = 15.4',
    scorePick(row, { locked_multiplier: TIER_MULTIPLIER[2], is_captain: true }, { ownGoals }).total, 15.4);
  eq('Fábio as a tier-5 pick, no captain: 7 x 1 = 7',
    scorePick(row, { locked_multiplier: TIER_MULTIPLIER[5], is_captain: false }, { ownGoals }).total, 7);
}

// ── 2. Kaio Jorge, F, 1492402 (lost 4-2; he scored an own goal) ───────────
//   90 min .................. +2
//   1 assist ................ +3
//   3 shots on target x 0.5 . +1.5
//   2 key passes x 0.5 ...... +1
//   1 own goal .............. -2
//   conceded / clean sheet score 0 for an F
//   base = 5.5
{
  const { row, ownGoals } = player(1492402, 'Kaio Jorge');
  eq('Kaio Jorge: one own goal found in the events', ownGoals, 1);
  const b = basePoints(row, ownGoals);
  eq('Kaio Jorge: base 5.5', b.base, 5.5);
  eq('Kaio Jorge: breakdown', b.breakdown, {
    minutes: { count: 90, points: 2 }, assists: { count: 1, points: 3 }, conceded: { count: 4, points: 0 },
    shots_on: { count: 3, points: 1.5 }, key_passes: { count: 2, points: 1 }, own_goals: { count: 1, points: -2 },
  });
  eq('Kaio Jorge unranked (1.35x): 5.5 x 1.35 = 7.43',
    scorePick(row, { locked_multiplier: null, locked_tier: null, is_captain: false }, { ownGoals }).total, 7.43);
}

// ── 3. Kannemann, D, 1492416 (yellow, then sent off at 73') ───────────────
//   73 min .................. +2
//   3 conceded while on -> 1 lot of 2 ... -1
//   red card (replaces the yellow) ...... -3
//   base = -2: negative, so unscaled whatever the multiplier
{
  const { row, ownGoals } = player(1492416, 'Kannemann');
  const b = basePoints(row, ownGoals);
  eq('Kannemann: base -2', b.base, -2);
  check('Kannemann: the red replaces the yellow', b.breakdown.red && !b.breakdown.yellow, JSON.stringify(b.breakdown));
  eq('Kannemann as a tier-1 contrarian captain: still -2, never scaled',
    scorePick(row, { locked_multiplier: TIER_MULTIPLIER[1], is_captain: true, locked_contrarian: true }, { ownGoals }).total, -2);
}

// ── a reduced-feed row: penalty fields null -> 0, never NaN ───────────────
//   Roefs, GK, 1557466 (won 1-0): 90 min +2, clean sheet +4, 4 saves -> +1 = 7
{
  const { row, ownGoals } = player(1557466, 'Roefs');
  check('Roefs: pen_saved arrives null (reduced feed)', row.pen_saved === null);
  eq('Roefs: base 7', basePoints(row, ownGoals).base, 7);
}

// ── multipliers ───────────────────────────────────────────────────────────
eq('ladder (half compensation): tier 5 -> 1x ... tier 1 -> 1.35x',
  [5, 4, 3, 2, 1].map((t) => TIER_MULTIPLIER[t]), [1, 1.05, 1.1, 1.2, 1.35]);
eq('unranked default 1.35x, paid like tier 1',
  [tierMultiplier(null), tierMultiplier(undefined), UNRANKED_MULTIPLIER], [1.35, 1.35, 1.35]);
check('the ladder rises from tier 5 to tier 1',
  [5, 4, 3, 2, 1].every((t, i, a) => i === 0 || TIER_MULTIPLIER[t] > TIER_MULTIPLIER[a[i - 1]]));
eq('the default captain mode is additive', CAPTAIN_MODE, 'additive');
eq('additive: tier 4 captain 1.05 + 1 -> 2.05x', effectiveMultiplier({ tierMult: TIER_MULTIPLIER[4], captain: true }), 2.05);
eq('additive: the most any pick can reach today, tier 1 captain contrarian 1.35 + 1 + 0.5 -> 2.85x',
  effectiveMultiplier({ tierMult: TIER_MULTIPLIER[1], captain: true, contrarian: true }), 2.85);
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

// ── no money language in the game's code ─────────────────────────────────
{
  const word = ['od', 'ds'].join('');   // spelt this way so this file passes its own check
  const files = ['api/_lib/scout-game.js', 'api/cron/player-stats.js', 'supabase/migrations/017_scout_game.sql',
    'supabase/migrations/018_scout_game_ladder.sql', 'supabase/migrations/019_scout_game_reads.sql'];
  // Money words, spelt in pieces so this file passes its own check.
  const banned = [word, ['b', 'et'].join(''), ['win', ' money'].join('')];
  const hits = [];
  for (const f of files) for (const w of banned) if (new RegExp(`\\b${w}\\b`, 'i').test(read(f))) hits.push(`${f}: ${w}`);
  eq('no money language in any game file', hits, []);
}

for (const f of failures) console.log(`  FAIL  ${f}`);
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
