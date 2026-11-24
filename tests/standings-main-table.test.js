// A club's position is its place in the league's MAIN table (A0, 22 Nov 2026).
//
//   node tests/standings-main-table.test.js
//
// standings.js collapses a league's tables into one row per club (the club
// header, the Clubs grid and the Home band read that row). It took the BEST
// rank across every table, so a Uruguayan club 1st in the Clausura and 6th in
// the annual table read as "1st". Now (mainTable):
//   1. the annual table ("Primera: Tabla Anual") or the one named after the
//      league (Argentina's "Liga Profesional Argentina");
//   2. never "Promedios" (relegation averages);
//   3. else the one table larger than every other (Série C's first stage);
//   4. no main table (MLS: two conferences) → the best rank, as before.
// The real handler runs against a stubbed API-Football and Supabase; every
// table is still written whole to standings_groups (the Matches table view).
// No dependencies.

let passed = 0;
const failures = [];
const check = (name, ok, detail) => { if (ok) passed++; else failures.push(detail ? `${name}\n      ${detail}` : name); };
const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`);

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_test';
process.env.API_FOOTBALL_KEY = 'af_test';
process.env.CRON_SECRET = 'cron_test';
const { mainTable } = await import('../api/_cron/standings.js');

// A table: label + [api team id, rank] pairs.
const table = (label, pairs) => pairs.map(([id, rank]) => ({ rank, team: { id, name: 'T' + id }, points: 30 - rank, goalsDiff: 0, group: label, form: 'WDL', all: { played: 10, win: 5, draw: 2, lose: 3, goals: { for: 10, against: 8 } } }));
const URU = [
  table('Primera: Tabla Anual', [[1, 1], [2, 2], [3, 6]]),
  table('Primera: Promedios', [[3, 1], [1, 2], [2, 3]]),
  table('Primera: Torneo Intermedio', [[2, 1], [3, 2], [1, 3]]),
  table('Primera: Apertura', [[1, 1], [2, 2], [3, 3]]),
  table('Primera: Clausura', [[3, 1], [1, 2], [2, 3]]),
];
const ARG = [table('Apertura - Group A', [[1, 1], [2, 2]]), table('Apertura - Group B', [[3, 1], [4, 2]]), table('Clausura - Group A', [[1, 2], [3, 1]]),
  table('Clausura - Group B', [[2, 1], [4, 2]]), table('Liga Profesional Argentina', [[1, 3], [2, 1], [3, 4], [4, 2]])];
const SERIE_C = [table('First stage', [[1, 5], [2, 1], [3, 2], [4, 3], [5, 4]]), table('Second stage - Group A', [[1, 1], [2, 2]]), table('Second stage - Group B', [[3, 1], [4, 2]])];
const MLS = [table('Western Conference', [[1, 1], [2, 2]]), table('Eastern Conference', [[3, 1], [4, 2]])];

eq('Uruguay: the annual table is the main one, not Promedios, not the Clausura', mainTable(URU, 'Primera División'), 0);
eq('Argentina: the table named after the league (its annual table)', mainTable(ARG, 'Liga Profesional Argentina'), 4);
eq('Série C: the one table larger than every other (the first stage)', mainTable(SERIE_C, 'Serie C'), 0);
eq('MLS: two conferences of the same size, no annual table → none', mainTable(MLS, 'Major League Soccer'), null);
eq('one table: that one', mainTable([table('Serie A', [[1, 1]])], 'Serie A'), 0);
eq('Promedios is never the main table, even alone with a smaller table', mainTable([table('Primera: Promedios', [[1, 1], [2, 2], [3, 3]]), table('Primera: Apertura', [[1, 1], [2, 2]])], 'Primera División'), 1);
eq('nothing → null', [mainTable([], 'X'), mainTable(null, 'X')], [null, null]);

// ── The handler ──
async function run(slug, apiName, groups, apiIds) {
  const writes = {};
  globalThis.fetch = async (url, init = {}) => {
    const u = decodeURIComponent(String(url)), method = init.method || 'GET';
    const res = (b, s = 200) => ({ ok: s < 300, status: s, json: async () => b, text: async () => JSON.stringify(b), headers: { get: (h) => (/remaining/i.test(h) ? '7000' : /limit/i.test(h) ? '7500' : null) } });
    if (u.includes('api-sports.io')) return res({ response: [{ league: { name: apiName, standings: groups } }] });
    if (u.includes('/rest/v1/ingest_runs')) return method === 'POST' ? res([{ id: 1 }], 201) : res([]);
    if (u.includes('/rest/v1/leagues')) return res([{ id: 20, api_league_id: 268, slug, name: apiName, current_season: 2026, playable: false, season_end: '2026-12-31' }]);
    if (u.includes('/rest/v1/teams')) return res(apiIds.map((id) => ({ id: 100 + id, api_team_id: id })));
    if (method === 'POST') { const t = (/rest\/v1\/(\w+)/.exec(u) || [])[1]; writes[t] = (writes[t] || []).concat(JSON.parse(init.body)); return res(null, 201); }
    return res([]);
  };
  const mod = await import('../api/_cron/standings.js?' + Math.random());
  const out = { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  await mod.default({ url: '/api/cron/standings?league=' + slug, headers: { authorization: 'Bearer cron_test' } }, out);
  return { out, writes };
}
const uru = await run('uruguay', 'Primera División', URU, [1, 2, 3]);
const rowOf = (w, id) => (w.standings || []).find((r) => r.team_id === 100 + id);
check('the run succeeds', uru.out.code === 200 && uru.out.body.ok !== false, JSON.stringify(uru.out.body).slice(0, 300));
eq('Uruguay: club 3 is 6th (annual), not 1st (Clausura / Promedios)', [rowOf(uru.writes, 3).rank, rowOf(uru.writes, 3).group_label], [6, 'Primera: Tabla Anual']);
eq('…every club takes its annual row', [1, 2, 3].map((id) => rowOf(uru.writes, id).rank), [1, 2, 6]);
eq('…one row per club, no internal field leaks into the write', [(uru.writes.standings || []).length, Object.keys(rowOf(uru.writes, 1)).includes('_main')], [3, false]);
eq('…every table is still written whole to standings_groups (5 tables × 3 clubs)', (uru.writes.standings_groups || []).length, 15);
eq('…the run names the main table', uru.out.body.by_league[0].main_table, 'Primera: Tabla Anual');
const arg = await run('argentina', 'Liga Profesional Argentina', ARG, [1, 2, 3, 4]);
eq('Argentina: positions from the annual table', [1, 2, 3, 4].map((id) => rowOf(arg.writes, id).rank), [3, 1, 4, 2]);
const sc = await run('serie_c', 'Serie C', SERIE_C, [1, 2, 3, 4, 5]);
eq('Série C: positions from the first stage, not the groups of the second', [1, 2, 3, 4, 5].map((id) => rowOf(sc.writes, id).rank), [5, 1, 2, 3, 4]);
const mls = await run('mls', 'Major League Soccer', MLS, [1, 2, 3, 4]);
eq('MLS: no main table → each club\'s conference rank, as before', [1, 2, 3, 4].map((id) => rowOf(mls.writes, id).rank), [1, 2, 1, 2]);

for (const f of failures) console.log(`  FAIL  ${f}`);
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
