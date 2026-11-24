// /api/cron/teams?coaches=1 — the weekly coaches pass (api/cron/teams.js).
//
//   node tests/teams-cron.test.js
//
// Runs the real job against a fake Supabase and a fake API-Football with a
// fake clock: it stops starting work at the time budget (rule 16), saves a
// cursor and resumes from it, finishes the cycle and then waits (0 requests),
// never names a former coach, and never deletes (rule 13).
//
// The fake enforces teams.name NOT NULL on every POST the way Postgres does an
// upsert (INSERT ... ON CONFLICT checks NOT NULL on the inserted row first):
// a partial row answers 400 / 23502, which is the production failure of
// 16 Nov 2026 (coach upserted as { api_team_id, coach_name }). No dependencies.

let passed = 0;
const failures = [];
const check = (name, ok, detail) => { if (ok) passed++; else failures.push(detail ? `${name}\n      ${detail}` : name); };

process.env.SUPABASE_URL = 'https://db.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_test';
process.env.CRON_SECRET = 'cron-test-secret';
process.env.API_FOOTBALL_KEY = 'af_test';

const job = await import('../api/_cron/teams.js');

// ── A fake world ──
const TEAMS = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, api_team_id: 1000 + i }));
function world() {
  return { runs: [], coach: new Map(), apiCalls: [], methods: new Set(), clockStep: 0, now: 1_800_000_000_000,
    teamPosts: [], teamPatches: [], rejected: [] };
}
let W = world();
const realNow = Date.now;
Date.now = () => W.now;
const json = (b, status = 200, headers = {}) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json', ...headers } });

globalThis.fetch = async (url, opt = {}) => {
  const u = new URL(url);
  W.methods.add(opt.method || 'GET');
  if (u.host === 'v3.football.api-sports.io') {
    W.apiCalls.push(u.pathname + u.search);
    if (u.pathname === '/coachs') W.now += W.clockStep;  // each coach call "takes" clockStep ms
    const hdr = { 'x-ratelimit-requests-remaining': '7000', 'x-ratelimit-requests-limit': '7500' };
    if (u.pathname === '/teams') return json({ errors: [], response: [
      { team: { id: 1000, name: 'Club 1000', code: 'C10', country: 'Brazil', founded: 1904, logo: 'https://x/1000.png' },
        venue: { name: 'Stadium', city: 'Rio', capacity: 40000 } },
      { team: { id: 1999, name: null }, venue: {} },     // nameless: must be skipped, not sent
    ] }, 200, hdr);
    if (u.pathname === '/coachs') {
      const team = Number(u.searchParams.get('team'));
      // Team 1003 has only a former coach (spell ended): must NOT be named.
      if (team === 1003) return json({ errors: [], response: [{ name: 'Former Coach', career: [{ team: { id: team }, start: '2020-01-01', end: '2024-12-31' }] }] }, 200, hdr);
      return json({ errors: [], response: [
        { name: 'Assistant ' + team, career: [{ team: { id: team }, start: '2019-01-01', end: null }] },
        { name: 'Coach ' + team, career: [{ team: { id: team }, start: '2025-06-01', end: null }] },
      ] }, 200, hdr);
    }
    return json({ errors: [], response: [] }, 200, hdr);
  }
  const p = u.pathname;
  const body = opt.body ? JSON.parse(opt.body) : null;
  if (p === '/rest/v1/ingest_runs') {
    if (opt.method === 'POST') { W.runs.push({ id: W.runs.length + 1, job: body[0].job }); return json([{ id: W.runs.length }]); }
    if (opt.method === 'PATCH') { const id = Number((u.searchParams.get('id') || '').replace('eq.', '')); Object.assign(W.runs.find((r) => r.id === id), body); return new Response(null, { status: 204 }); }
    const ok = W.runs.filter((r) => r.job === 'teams' && r.ok === true && r.cursor != null).reverse();
    return json(ok.length ? [{ cursor: ok[0].cursor }] : []);
  }
  if (p === '/rest/v1/leagues') return json([{ id: 1, api_league_id: 71, slug: 'serie_a', name: 'Série A', current_season: 2026 }]);
  if (p === '/rest/v1/teams' && opt.method === 'POST') {
    // Postgres: the INSERT half of an upsert is checked for NOT NULL first.
    const bad = body.find((r) => r.api_team_id == null || r.name == null);
    if (bad) {
      W.rejected.push(bad);
      return json({ code: '23502', details: `Failing row contains (${JSON.stringify(bad)})`, message: 'null value in column "name" of relation "teams" violates not-null constraint' }, 400);
    }
    W.teamPosts.push(...body);
    return new Response(null, { status: 201 });
  }
  if (p === '/rest/v1/teams' && opt.method === 'PATCH') {
    const id = Number((u.searchParams.get('id') || '').replace('eq.', ''));
    const t = TEAMS.find((x) => x.id === id);
    W.teamPatches.push({ filter: u.search, body });
    if (t && 'coach_name' in body) W.coach.set(t.api_team_id, body.coach_name);
    return new Response(null, { status: 204 });
  }
  if (p === '/rest/v1/teams') {
    const after = Number((u.searchParams.get('id') || 'gt.0').replace('gt.', ''));
    return json(TEAMS.filter((t) => t.id > after));
  }
  return new Response('{"message":"not faked"}', { status: 404 });
};

async function run(query = '?coaches=1') {
  const res = { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; } };
  await job.default({ headers: { authorization: 'Bearer cron-test-secret' }, url: '/api/cron/teams' + query }, res);
  return res;
}

// ── 1. A run that hits the clock stops and saves where it got to ──
W = world();
W.clockStep = 7000;          // each coach call "takes" 7 s, so 3 start inside the 20 s budget
let r = await run();
const first = W.apiCalls.filter((c) => c.startsWith('/coachs')).length;
check('the job answers 200', r.code === 200, JSON.stringify(r.body));
check('a new cycle starts by refreshing teams and venues', W.apiCalls.some((c) => c.startsWith('/teams')));
check('it stops starting work at the time budget', r.body.stopped === 'clock' && first > 0 && first < TEAMS.length, `${first} coach calls, ${JSON.stringify(r.body.cursor)}`);
check('it saves a cursor with the last team done', r.body.cursor && r.body.cursor.after_team_id === TEAMS[first - 1].id, JSON.stringify(r.body.cursor));

// ── 2. The next run resumes from the cursor, without refreshing teams again ──
const before = W.apiCalls.length;
r = await run();
const second = W.apiCalls.slice(before);
check('the next run resumes after the saved team', second[0] === `/coachs?team=${1000 + first}`, second[0]);
check('a resumed run does not refresh teams again', !second.some((c) => c.startsWith('/teams')));

// ── 3. Runs continue until every team is done, then the cycle completes ──
W.clockStep = 0;
r = await run();
check('the last run finishes the cycle', r.body.cursor && r.body.cursor.complete_at && !r.body.stopped, JSON.stringify(r.body));
const asked = W.apiCalls.filter((c) => c.startsWith('/coachs')).map((c) => Number(c.split('=')[1]));
check('every team was asked exactly once in the cycle', TEAMS.every((t) => asked.filter((a) => a === t.api_team_id).length === 1), asked.join(','));

// ── 4. A completed cycle waits: 0 requests until REFRESH_DAYS have passed ──
const n = W.apiCalls.length;
W.now += 2 * 86_400_000;
r = await run();
check('a completed cycle waits, spending nothing', W.apiCalls.length === n && /waiting/.test(r.body.note || ''), JSON.stringify(r.body));
W.now += (job.REFRESH_DAYS) * 86_400_000;
r = await run();
check('after REFRESH_DAYS a new cycle starts', W.apiCalls.length > n && W.apiCalls.slice(n).some((c) => c.startsWith('/teams')));

// ── 5. The coach picked, and never a former one ──
check('the coach with the latest open spell is named', W.coach.get(1000) === 'Coach 1000', W.coach.get(1000));
check('a team with only a former coach gets no coach (null), not the former one', W.coach.has(1003) && W.coach.get(1003) === null, String(W.coach.get(1003)));
check('pickCurrentCoach: no open spell -> null', job.pickCurrentCoach([{ name: 'X', career: [{ team: { id: 5 }, end: '2024-01-01' }] }], 5) === null);

// ── 6. Without ?coaches=1 it is the teams + venues refresh only ──
const m = W.apiCalls.length;
r = await run('');
check('teams-only run: teams requests, no coach requests, no cursor', W.apiCalls.slice(m).every((c) => c.startsWith('/teams')) && r.body.cursor == null, JSON.stringify(r.body));

// ── 7. No partial rows: the 23502 of 16 Nov 2026 ──
check('no request was rejected for a missing NOT NULL column', W.rejected.length === 0, JSON.stringify(W.rejected[0]));
check('the fake really enforces NOT NULL (a partial upsert answers 400 / 23502)', await (async () => {
  const res = await fetch('https://db.test/rest/v1/teams?on_conflict=api_team_id', { method: 'POST', body: JSON.stringify([{ api_team_id: 1000, coach_name: 'X' }]) });
  W.rejected.pop();
  return res.status === 400 && (await res.json()).code === '23502';
})());
check('every teams row the job inserts carries api_team_id and name', W.teamPosts.length > 0 && W.teamPosts.every((r) => r.api_team_id != null && r.name), JSON.stringify(W.teamPosts.find((r) => !r.name)));
check('an API team without a name is skipped, not sent', !W.teamPosts.some((r) => r.api_team_id === 1999));
check('the coach is written by PATCH on the existing row (id=eq.), never by upsert',
  W.teamPatches.length >= TEAMS.length && W.teamPatches.every((x) => /^\?id=eq\.\d+$/.test(x.filter))
  && W.teamPosts.every((r) => !('coach_name' in r)), JSON.stringify(W.teamPatches[0]));
check('the coach PATCH touches only coach_name and updated_at',
  W.teamPatches.every((x) => Object.keys(x.body).sort().join(',') === 'coach_name,updated_at'), JSON.stringify(W.teamPatches[0]?.body));

// ── 8. Rule 13 and auth ──
check('nothing is deleted (no DELETE request)', !W.methods.has('DELETE'), [...W.methods].join(','));
{
  const res = { code: 0, status(c) { this.code = c; return this; }, json() {} };
  await job.default({ headers: {}, url: '/api/cron/teams?coaches=1' }, res);
  check('no cron secret, 401', res.code === 401);
}
check('the time budget is the shared 20 s window (cron-job.org gives up at 30 s)', job.TIME_BUDGET_MS === 20_000);

Date.now = realNow;
for (const f of failures) console.log(`  FAIL  ${f}`);
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
