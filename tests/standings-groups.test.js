// Sequence 2 commit 4b-3a: every standings table, group by group
// (api/cron/standings.js + migration 032).
//
//   node tests/standings-groups.test.js
//
// Runs the real standings job against a fake Supabase and a fake
// API-Football. Brazil answers with the frozen one-table response
// (tests/fixtures/api-football/standings.json); Argentina with a SYNTHETIC
// response shaped like the real one (two groups per phase plus the annual
// table, the same clubs in several tables; 6 clubs instead of 30 to keep it
// readable). Checks:
// - standings_groups gets every (group, club) row: nothing dropped, the
//   group's order kept, a club in three tables three times;
// - `standings`: one row per club, its place in the main (annual) table (A0);
// - whole rows (rule 25), no DELETE (rule 13), a re-run is safe;
// - before 032 runs (table missing) the league still gets its table and
//   snapshot, and the run says why the groups were skipped;
// - the migration: re-runnable, RLS, public read, nothing for the browser to
//   write, a verification query.
// No dependencies.

import { readFileSync } from 'node:fs';

let passed = 0;
const failures = [];
const check = (name, ok, detail) => { if (ok) passed++; else failures.push(detail ? `${name}\n      ${detail}` : name); };
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

process.env.SUPABASE_URL = 'https://db.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_test';
process.env.CRON_SECRET = 'cron-test-secret';
process.env.API_FOOTBALL_KEY = 'af_test';

const job = await import('../api/_cron/standings.js');
const brazil = JSON.parse(read('tests/fixtures/api-football/standings.json'));

// Synthetic Argentina: clubs 9001..9006 (api ids), A = 9001-9003, B = 9004-9006.
const row = (api, rank, pts, group) => ({ rank, team: { id: api, name: 'Club ' + api }, points: pts, goalsDiff: pts - 10, group, form: 'WDLWW',
  all: { played: 16, win: 5, draw: 3, lose: 8, goals: { for: 20, against: 18 } } });
const argentina = { errors: [], response: [{ league: { id: 128, season: 2026, standings: [
  [row(9001, 1, 30, 'Apertura - Group A'), row(9002, 2, 25, 'Apertura - Group A'), row(9003, 3, 20, 'Apertura - Group A')],
  [row(9004, 1, 28, 'Apertura - Group B'), row(9005, 2, 22, 'Apertura - Group B'), row(9006, 3, 18, 'Apertura - Group B')],
  [row(9002, 1, 31, 'Clausura - Group A'), row(9001, 2, 27, 'Clausura - Group A'), row(9003, 3, 12, 'Clausura - Group A')],
  [row(9006, 1, 29, 'Clausura - Group B'), row(9004, 2, 21, 'Clausura - Group B'), row(9005, 3, 19, 'Clausura - Group B')],
  [row(9001, 1, 57, 'Liga Profesional Argentina'), row(9002, 2, 56, 'Liga Profesional Argentina'), row(9004, 3, 49, 'Liga Profesional Argentina'),
   row(9006, 4, 47, 'Liga Profesional Argentina'), row(9005, 5, 41, 'Liga Profesional Argentina'), row(9003, 6, 32, 'Liga Profesional Argentina')],
  [row(9999, 1, 10, 'Apertura - Group A')],   // a club we do not carry: skipped, as in `standings`
] } }] };

const brazilTeams = brazil.response[0].league.standings[0].map((s, i) => ({ id: 100 + i, api_team_id: s.team.id }));
const argTeams = [9001, 9002, 9003, 9004, 9005, 9006].map((a, i) => ({ id: 200 + i, api_team_id: a }));

function world(groupsTable = true) {
  return { groupsTable, posts: {}, methods: new Set(), rejected: [] };
}
let W = world();
const json = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json', 'x-ratelimit-requests-remaining': '7000', 'x-ratelimit-requests-limit': '7500' } });

globalThis.fetch = async (url, opt = {}) => {
  const u = new URL(url);
  W.methods.add(opt.method || 'GET');
  if (u.host === 'v3.football.api-sports.io') {
    return json(u.searchParams.get('league') === '128' ? argentina : brazil);
  }
  const p = u.pathname.replace('/rest/v1/', '');
  const body = opt.body ? JSON.parse(opt.body) : null;
  if (p === 'ingest_runs') return opt.method === 'POST' ? json([{ id: 1 }]) : new Response(null, { status: 204 });
  if (p === 'leagues') return json([{ id: 1, api_league_id: 71, slug: 'serie_a', name: 'Série A', current_season: 2026 },
    { id: 7, api_league_id: 128, slug: 'argentina', name: 'Liga Profesional', current_season: 2026 }]);
  if (p === 'teams') return json([...brazilTeams, ...argTeams]);
  if (opt.method === 'POST') {
    if (p === 'standings_groups' && !W.groupsTable) return json({ code: '42P01', message: 'relation "public.standings_groups" does not exist' }, 404);
    // The INSERT half of an upsert checks NOT NULL first (rule 25).
    const notNull = { standings: ['league_id', 'season', 'team_id'], standings_groups: ['league_id', 'season', 'group_label', 'team_id', 'group_order'],
      standings_snapshots: ['league_id', 'season', 'team_id', 'snapshot_date'] }[p] || [];
    const bad = body.find((r) => notNull.some((c) => r[c] == null));
    if (bad) { W.rejected.push({ p, bad }); return json({ code: '23502', message: 'not-null violation' }, 400); }
    // Postgres refuses a batch that hits the same key twice (21000).
    const key = { standings: ['league_id', 'season', 'team_id'], standings_groups: ['league_id', 'season', 'group_label', 'team_id'] }[p];
    if (key) {
      const keys = body.map((r) => key.map((c) => r[c]).join('|'));
      if (new Set(keys).size !== keys.length) { W.rejected.push({ p, dup: true }); return json({ code: '21000', message: 'ON CONFLICT DO UPDATE command cannot affect row a second time' }, 500); }
    }
    (W.posts[p] = W.posts[p] || []).push(...body);
    return new Response(null, { status: 201 });
  }
  return new Response('{"message":"not faked"}', { status: 404 });
};

async function run() {
  const res = { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; } };
  await job.default({ headers: { authorization: 'Bearer cron-test-secret' }, url: '/api/cron/standings' }, res);
  return res;
}

// ── 1. With 032 run ──
let r = await run();
const g = W.posts.standings_groups || [];
const arg = g.filter((x) => x.league_id === 7);
check('the job answers 200', r.code === 200, JSON.stringify(r.body));
check('every (group, club) row of Argentina is kept: 3+3+3+3+6 = 18', arg.length === 18, String(arg.length));
const labels = [...new Set(arg.map((x) => x.group_label))];
check('five tables, in the API\'s order', JSON.stringify(labels) === JSON.stringify(['Apertura - Group A', 'Apertura - Group B', 'Clausura - Group A', 'Clausura - Group B', 'Liga Profesional Argentina'])
  && JSON.stringify([...new Set(arg.map((x) => x.group_order))]) === '[0,1,2,3,4]');
const club9001 = arg.filter((x) => x.team_id === 200).map((x) => x.group_label + ':' + x.rank);
check('a club in three tables appears in all three, with each table\'s own rank', JSON.stringify(club9001) === JSON.stringify(['Apertura - Group A:1', 'Clausura - Group A:2', 'Liga Profesional Argentina:1']), club9001.join(' '));
check('a club we do not carry is skipped', !arg.some((x) => x.team_id == null));
check('each group is whole (Clausura A: 3 clubs, ranks 1-3)', JSON.stringify(arg.filter((x) => x.group_label === 'Clausura - Group A').map((x) => x.rank)) === '[1,2,3]');
const bra = g.filter((x) => x.league_id === 1);
check('a one-table league is one group, named as the API names it', bra.length === 20 && new Set(bra.map((x) => x.group_label)).size === 1 && bra[0].group_label === 'Serie A' && bra.every((x) => x.group_order === 0));
check('rows carry the numbers the table shows (P W D L GF GA GD Pts, form)', ['played', 'win', 'draw', 'lose', 'goals_for', 'goals_against', 'goal_diff', 'points', 'form'].every((c) => arg[0][c] != null));
const st = (W.posts.standings || []).filter((x) => x.league_id === 7);
// Since A0 (22 Nov 2026, tests/standings-main-table.test.js) a club's row is its
// place in the league's main table (Argentina: the annual one), not its best rank.
const annual = new Map(arg.filter((x) => x.group_label === 'Liga Profesional Argentina').map((x) => [x.team_id, x.rank]));
check('`standings`: one row per club, its rank in the annual table', st.length === 6 && st.every((x) => x.rank === annual.get(x.team_id) && x.group_label === 'Liga Profesional Argentina'),
  JSON.stringify(st.map((x) => [x.team_id, x.rank, annual.get(x.team_id)])));
check('no row rejected (whole rows, no duplicate key in a batch)', W.rejected.length === 0, JSON.stringify(W.rejected));
check('the run reports the group rows', r.body.by_league.find((x) => x.league === 'argentina').group_rows === 18);
check('nothing deleted (rule 13)', !W.methods.has('DELETE'));
r = await run();
check('a re-run is safe (same keys, upserted)', r.code === 200 && W.rejected.length === 0);

// ── 2. Before 032 runs ──
W = world(false);
r = await run();
const argDiag = r.body && r.body.by_league && r.body.by_league.find((x) => x.league === 'argentina');
check('before 032: the run still succeeds', r.code === 200, JSON.stringify(r.body));
check('before 032: every league still gets its table and its snapshot', (W.posts.standings || []).length === 26 && (W.posts.standings_snapshots || []).length === 26);
check('before 032: the run says why the groups were skipped', argDiag && argDiag.group_rows === 0 && /standings_groups/.test(argDiag.groups_error || ''));

// ── 3. The migration ──
const sql = read('supabase/migrations/032_standings_groups.sql');
const code = sql.replace(/--[^\r\n]*/g, '');
check('032: the table keeps one row per (group, club)', /primary key \(league_id, season, group_label, team_id\)/.test(code));
check('032: re-runnable', /create table if not exists public\.standings_groups/.test(code) && /create index if not exists/.test(code)
  && /drop policy if exists "standings_groups: public read"/.test(code));
check('032: RLS on, public read only', /alter table public\.standings_groups enable row level security/.test(code)
  && /for select to anon, authenticated using \(true\)/.test(code) && /revoke all on public\.standings_groups from public, anon, authenticated;/.test(code)
  && /grant select on public\.standings_groups to anon, authenticated;/.test(code) && !/grant (insert|update|delete)[^;]*to (anon|authenticated)/.test(code));
check('032: carries a verification query', /VERIFICATION/.test(sql) && /argentina_groups_whole/.test(sql));
check('the job writes the groups in their own try (rule 21)', /try \{\s*groupsWritten = await upsert\('standings_groups'/.test(read('api/_cron/standings.js')));

for (const f of failures) console.log(`  FAIL  ${f}`);
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
