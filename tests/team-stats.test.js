// Team season aggregation tests — computeTeamRow()'s denominators.
//
//   node tests/team-stats.test.js
//
// No dependencies, like the other tests. Exit code 0 on success, 1 on failure.
//
// Pinned to the pass-accuracy bug found in R7: a fixture whose pass % the API
// did not publish used to be averaged in as 0%.

import { computeTeamRow } from '../api/cron/fixture-stats.js';

let passed = 0;
const failures = [];
function eq(name, got, want) {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) passed++; else failures.push(`${name}\n      got  ${g}\n      want ${w}`);
}

// Team 1 plays three home games. Fixture 12 has no pass % (null), like ~30% of
// real fixture_stats rows.
const fixtures = [10, 11, 12].map((id) => ({
  id, league_id: 1, season: 2026, home_team_id: 1, away_team_id: 2, home_goals: 1, away_goals: 0,
}));
const side = (team, pa, pos) => ({
  team_id: team, shots_total: 10, shots_on: 4, fouls: 12, yellow: 2,
  possession_pct: pos, passes_pct: pa, expected_goals: null, goals_prevented: null,
});
const stats = new Map([
  [10, [side(1, 80, 50), side(2, 70, 50)]],
  [11, [side(1, 90, 60), side(2, 75, 40)]],
  [12, [side(1, null, 55), side(2, null, 45)]],
]);
const row = computeTeamRow(1, 2026, fixtures, stats);

eq('pa averages only the fixtures that have a pass %', row.pa, 85);
eq('pa_sample counts those fixtures', row.pa_sample, 2);
eq('fixtures_sampled still counts all three', row.fixtures_sampled, 3);
eq('possession, never null here, still uses fixtures_sampled', row.pos_pct, 55);
eq('gs per game over matches', [row.matches, row.gs], [3, 1]);

{
  // No pass % anywhere: null, never 0.
  const none = new Map([[10, [side(1, null, 50)]], [11, [side(1, null, 50)]], [12, [side(1, null, 50)]]]);
  const r = computeTeamRow(1, 2026, fixtures, none);
  eq('no published pass % -> pa null, pa_sample 0', [r.pa, r.pa_sample], [null, 0]);
}

for (const f of failures) console.log(`  FAIL  ${f}`);
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
