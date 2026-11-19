// The live job finalises matches that have left the live feed (19 Nov 2026).
//
//   node tests/live-finalise.test.js
//
// Six Série A matches of 18 Nov stayed "LIVE 86'–90'" the next morning: the
// live job only wrote fixtures present in live=all, a finished match drops
// out of that feed, and the fixtures job's daily pass (commit 1) had run at
// ~00:00 UTC, before they ended. The real handler of api/cron/live.js runs
// here against a stubbed API-Football and Supabase. Covered:
// - live → FT: a fixture we hold as 2H / HT that is no longer in live=all is
//   fetched by id and written with its final status, score and minute (a
//   PATCH by api_fixture_id, rule 25), while a match still in the feed is not;
// - a "not started" fixture hours after kick-off is fetched too;
// - a completed fixtures daily pass does not block it (the live job never
//   reads the fixtures cursor);
// - bounded: at most FINALISE_MAX_REQUESTS requests of up to 20 ids, the last
//   3 days, rows quiet for 15+ minutes, inside RUN_BUDGET_MS (rule 16);
// - a failed finalise never costs the live scores already written.
// No dependencies.

import { readFileSync } from 'node:fs';

let passed = 0;
const failures = [];
const check = (name, ok, detail) => { if (ok) passed++; else failures.push(detail ? `${name}\n      ${detail}` : name); };
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_test';
process.env.API_FOOTBALL_KEY = 'af_test';
process.env.CRON_SECRET = 'cron_test';

const json = (body, status = 200) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body),
  headers: { get: (h) => (/remaining/i.test(h) ? '7000' : /limit/i.test(h) ? '7500' : null) } });

/** One run of the real handler against a world: { live, stale, final, failFinalise }. */
async function run(world) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const method = init.method || 'GET';
    calls.push({ method, url: String(url), body: init.body ? JSON.parse(init.body) : null });
    const u = String(url);
    if (u.includes('api-sports.io')) {
      if (/[?&]live=all/.test(u)) return json({ results: world.live.length, response: world.live });
      const ids = (/[?&]ids=([\d-]+)/.exec(u) || [])[1];
      if (ids) return json({ response: ids.split('-').map(Number).filter((id) => world.final[id]).map((id) => world.final[id]) });
      return json({ response: [] });
    }
    if (u.includes('/rest/v1/ingest_runs')) return method === 'POST' ? json([{ id: 1 }], 201) : json(world.cursor || []);
    if (u.includes('/rest/v1/leagues')) return json([{ id: 1, api_league_id: 71, slug: 'serie_a', current_season: 2026, playable: true, season_end: '2026-12-02' }]);
    if (u.includes('/rest/v1/teams')) return json([{ id: 7, api_team_id: 127 }, { id: 9, api_team_id: 121 }]);
    if (u.includes('/rest/v1/fixtures') && method === 'GET') {
      if (world.failFinalise) return json({ message: 'boom' }, 500);
      return json(world.stale);
    }
    if (u.includes('/rest/v1/fixtures') && (method === 'PATCH' || method === 'POST')) return json(null, 204);
    return json([]);
  };
  const mod = await import('../api/cron/live.js?' + Math.random());
  const res = { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  await mod.default({ url: '/api/cron/live', headers: { authorization: 'Bearer cron_test' } }, res);
  return { res, calls, mod };
}
const fx = (id, short, elapsed, h, a) => ({ fixture: { id, date: '2026-11-19T00:30:00+00:00', status: { short, elapsed }, venue: { name: 'X' } },
  league: { id: 71, round: 'Regular Season - 35' }, teams: { home: { id: 127 }, away: { id: 121 } }, goals: { home: h, away: a } });

// ── live → FT once the match has left the feed ──
const night = await run({
  live: [fx(900, '2H', 67, 1, 0)],                                       // still on: written by the live part
  stale: [{ id: 1, api_fixture_id: 101, status_short: '2H', kickoff_utc: '2026-11-19T00:30:00Z' },
          { id: 2, api_fixture_id: 102, status_short: 'HT', kickoff_utc: '2026-11-19T00:30:00Z' },
          { id: 3, api_fixture_id: 103, status_short: 'NS', kickoff_utc: '2026-11-18T22:00:00Z' },
          { id: 4, api_fixture_id: 900, status_short: '2H', kickoff_utc: '2026-11-19T01:00:00Z' }],
  final: { 101: fx(101, 'FT', 90, 0, 0), 102: fx(102, 'FT', 90, 2, 1), 103: fx(103, 'FT', 90, 4, 0) },
});
const r = night.res.body || {};
check('the run succeeds', night.res.code === 200 && r.ok === true, JSON.stringify(r));
const idsCall = night.calls.find((c) => /api-sports\.io\/fixtures\?.*ids=/.test(c.url));
check('the matches that left the feed are fetched by id; the one still in the feed is not', !!idsCall && /ids=101-102-103(&|$)/.test(idsCall.url) && !/900/.test(idsCall.url), idsCall && idsCall.url);
const patches = night.calls.filter((c) => c.method === 'PATCH' && /\/rest\/v1\/fixtures\?api_fixture_id=eq\./.test(c.url));
const byId = Object.fromEntries(patches.map((c) => [Number(/eq\.(\d+)/.exec(c.url)[1]), c.body]));
check('each is written with its FINAL status, score and minute (2H 0-0 → FT 0-0; HT → FT 2-1)',
  byId[101] && byId[101].status_short === 'FT' && byId[101].home_goals === 0 && byId[101].elapsed === 90
  && byId[102] && byId[102].status_short === 'FT' && byId[102].home_goals === 2 && byId[102].away_goals === 1, JSON.stringify(byId));
check('a "not started" fixture hours after kick-off is finalised too', byId[103] && byId[103].status_short === 'FT' && byId[103].home_goals === 4);
check('a PATCH by api_fixture_id with only the changing columns (rule 25: it can create nothing)',
  patches.every((c) => JSON.stringify(Object.keys(c.body).sort()) === JSON.stringify(['away_goals', 'elapsed', 'home_goals', 'status_short', 'updated_at'])));
check('the match still on is written by the live part, not touched by the finaliser', !byId[900]
  && night.calls.some((c) => c.method === 'POST' && /\/rest\/v1\/fixtures/.test(c.url) && JSON.stringify(c.body).includes('"api_fixture_id":900')));
check('the run reports what it finalised', r.finalised === 3 && r.finalise_requests === 1 && r.stale_found === 3
  && (r.status_changes || []).includes('101:2H→FT'), JSON.stringify(r));
check('cost: one live=all + one ids request', r.requests_used === 2, String(r.requests_used));

// ── A completed fixtures daily pass does not block finalisation ──
const done = await run({
  cursor: [{ cursor: { day: new Date().toISOString().slice(0, 10), complete: true } }],   // the fixtures job's "today is done"
  live: [], stale: [{ id: 1, api_fixture_id: 201, status_short: '2H', kickoff_utc: '2026-11-19T00:30:00Z' }],
  final: { 201: fx(201, 'FT', 90, 3, 2) },
});
check('fixtures daily pass complete → the live job still finalises', (done.res.body || {}).finalised === 1);
check('the live job never reads the fixtures cursor', !done.calls.some((c) => c.method === 'GET' && /ingest_runs/.test(c.url)) && !/dailyPass/.test(read('api/cron/live.js')));

// ── Bounded ──
const many = await run({ live: [], stale: Array.from({ length: 100 }, (_, i) => ({ id: i, api_fixture_id: 1000 + i, status_short: '2H', kickoff_utc: '2026-11-19T00:30:00Z' })),
  final: Object.fromEntries(Array.from({ length: 100 }, (_, i) => [1000 + i, fx(1000 + i, 'FT', 90, 1, 1)])) });
const idsCalls = many.calls.filter((c) => /api-sports\.io\/fixtures\?.*ids=/.test(c.url));
check(`at most ${many.mod.FINALISE_MAX_REQUESTS} requests of ${many.mod.IDS_PER_REQUEST} ids a run`, idsCalls.length === many.mod.FINALISE_MAX_REQUESTS
  && idsCalls.every((c) => ((/ids=([\d-]+)/.exec(c.url) || [])[1] || '').split('-').length <= 20) && (many.res.body || {}).finalised === 60, `${idsCalls.length} requests, ${(many.res.body || {}).finalised} finalised`);
const q = night.calls.find((c) => c.method === 'GET' && /\/rest\/v1\/fixtures\?select=id,api_fixture_id,status_short/.test(c.url));
const qs = q ? decodeURIComponent(q.url) : '';
check('the stale query: our leagues, the last 3 days, quiet 15+ minutes, live statuses or "not started" long after kick-off',
  /league_id=in\.\(1\)/.test(qs) && /kickoff_utc=gte\./.test(qs) && /updated_at=lt\./.test(qs)
  && /status_short\.in\.\(1H,HT,2H,ET,BT,P,LIVE,INT,SUSP\)/.test(qs) && /and\(status_short\.in\.\(NS,TBD\),kickoff_utc\.lt\./.test(qs), qs);
const src = read('api/cron/live.js');
check('inside the 20 s window (rule 16): every request and write checks RUN_BUDGET_MS', (src.match(/Date\.now\(\) - started > RUN_BUDGET_MS/g) || []).length >= 2);

// ── A failed finalise never costs the live scores ──
const bad = await run({ failFinalise: true, live: [fx(900, '2H', 70, 1, 0)], stale: [], final: {} });
check('finalise fails → the run still succeeds with the live scores written, and says why', bad.res.code === 200 && (bad.res.body || {}).rows_written === 1
  && /boom|500/.test((bad.res.body || {}).finalise_error || ''), JSON.stringify(bad.res.body));

for (const f of failures) console.log(`  FAIL  ${f}`);
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
