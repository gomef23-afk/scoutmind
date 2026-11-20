// A tracked league holds its whole current season (21 Nov 2026).
//
//   node tests/fixtures-whole-season.test.js
//
// The ten leagues switched on 18 Nov were loaded through the fixtures job's
// window only (8 days back, 21 ahead), which began on 10 Nov, the first day of
// an international break. ~1,780 results of their seasons were never loaded:
// Championship, Eredivisie, Primeira Liga, Scottish Premiership and Süper Lig
// held 0 finished matches, so match panels, club pages and season stats were
// empty, and the stats jobs (which take ANY finished fixture we hold) had
// nothing to fetch. The real handler of api/cron/fixtures.js runs here against
// a stubbed API-Football and Supabase. Covered:
// - a league whose season began before the window and of which we hold no
//   earlier fixture is asked for its whole season (no from / to), still ONE
//   request; a league that holds its history gets the window, as before;
// - the next day (history held) the same league is back on the window;
// - a season that begins inside the window, ?back= and a failed check all
//   keep the window; ?full=1 still forces the season;
// - the stats queues take any finished fixture we hold (no "added after"
//   bound), so a loaded season is fetched by the jobs as they run.
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
const res = (body, status = 200) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body),
  headers: { get: (h) => (/remaining/i.test(h) ? '7000' : /limit/i.test(h) ? '7500' : null) } });

const LEAGUES = [
  { id: 2, api_league_id: 39, slug: 'premier_league', current_season: 2026, playable: true, season_end: '2027-05-30' },
  { id: 8, api_league_id: 40, slug: 'championship', current_season: 2026, playable: false, season_end: '2027-05-01' },
  { id: 14, api_league_id: 253, slug: 'mls', current_season: 2026, playable: false, season_end: '2026-12-06' },
];

/** One run. world.history = league ids that hold fixtures before the window; world.failCheck. */
async function run(world = {}, query = '') {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const method = init.method || 'GET';
    const u = decodeURIComponent(String(url));
    calls.push({ method, url: u });
    if (u.includes('api-sports.io')) return res({ results: 1, paging: { total: 1 }, response: [] });
    if (u.includes('/rest/v1/ingest_runs')) return method === 'POST' ? res([{ id: 1 }], 201) : res([]);
    if (u.includes('/rest/v1/leagues')) return res(LEAGUES);
    if (u.includes('/rest/v1/teams')) return res([]);
    if (u.includes('/rest/v1/fixtures') && method === 'GET') {
      if (world.failCheck) return res({ message: 'boom' }, 500);
      const lid = Number((/league_id=eq\.(\d+)/.exec(u) || [])[1]);
      return res((world.history || []).includes(lid) ? [{ id: 1 }] : []);
    }
    return res(null, 201);
  };
  const mod = await import('../api/cron/fixtures.js?' + Math.random());
  const out = { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  await mod.default({ url: '/api/cron/fixtures' + query, headers: { authorization: 'Bearer cron_test' } }, out);
  const req = (apiId) => calls.filter((c) => c.url.includes('api-sports.io') && c.url.includes(`league=${apiId}`));
  return { out, calls, req, mod };
}
const windowed = (c) => /[?&]from=\d{4}-\d{2}-\d{2}/.test(c.url) && /[?&]to=\d{4}-\d{2}-\d{2}/.test(c.url);

// ── Day 1: the Championship holds nothing before the window ──
const d1 = await run({ history: [2] });
const b1 = d1.out.body || {};
check('the run succeeds', d1.out.code === 200 && b1.ok !== false, JSON.stringify(b1).slice(0, 300));
check('the Championship (no history held) is asked for its whole season: league + season, no from / to', d1.req(40).length === 1
  && !windowed(d1.req(40)[0]) && /season=2026/.test(d1.req(40)[0].url), d1.req(40).map((c) => c.url).join(' | '));
check('the Premier League (history held) gets the window, as before', d1.req(39).length === 1 && windowed(d1.req(39)[0]));
check('MLS (no history held, season began in February) too: the whole season', d1.req(253).length === 1 && !windowed(d1.req(253)[0]));
check('still ONE request per league: no extra cost for the season', (b1.requests_used ?? 0) === 3, String(b1.requests_used));
const diag = Object.fromEntries((b1.by_league || []).map((d) => [d.league, d.whole_season]));
check('the run says which leagues loaded the whole season', diag.championship === true && diag.mls === true && diag.premier_league === false, JSON.stringify(diag));
const histQ = d1.calls.find((c) => c.method === 'GET' && /\/rest\/v1\/fixtures\?select=id&league_id=eq\.8&/.test(c.url));
check('the history check: this league, this season, kicked off before the window, one row at most', !!histQ
  && /season=eq\.2026/.test(histQ.url) && /kickoff_utc=lt\.\d{4}-\d{2}-\d{2}T00:00:00Z/.test(histQ.url) && /limit=1/.test(histQ.url), histQ && histQ.url);

// ── Day 2: the season is held, so the window again ──
const d2 = await run({ history: [2, 8, 14] });
check('the next day, with its history held, the Championship is back on the window', d2.req(40).length === 1 && windowed(d2.req(40)[0]) && d2.req(253).every(windowed));

// ── What keeps the window ──
const back = await run({ history: [] }, '?league=championship&back=30&ahead=60');
check('?back= asks for a specific window: honoured', back.req(40).length === 1 && windowed(back.req(40)[0]));
const failed = await run({ failCheck: true });
check('a failed history check keeps the window (it can never cost a run)', failed.out.code === 200 && [39, 40, 253].every((id) => failed.req(id).every(windowed)));
const forced = await run({ history: [2, 8, 14] }, '?league=premier_league&full=1');
check('?full=1 still forces the whole season', forced.req(39).length === 1 && !windowed(forced.req(39)[0]));
const { needsWholeSeason } = d1.mod;
check('a season that begins inside the window is never "missing" (nothing to fetch yet)', await needsWholeSeason({ id: 99, slug: 'premier_league', current_season: 2026 }, '2026-08-01') === false);
check('a league not in the config is left alone', await needsWholeSeason({ id: 99, slug: 'no_such_league', current_season: 2026 }, '2026-11-13') === false);

// ── The stats queues take any finished fixture we hold ──
for (const f of ['fixture-stats', 'player-stats']) {
  const src = read(`api/cron/${f}.js`);
  const q = (/const queueFilter = \[([\s\S]*?)\]\.join\('&'\);/.exec(src) || [])[1] || '';
  check(`${f}: the queue is every finished fixture we hold without stats (no lower date bound, no "added after")`,
    /status_short=in\./.test(q) && /fetched_at=is\.null/.test(q) && /kickoff_utc=lte\./.test(q) && !/kickoff_utc=gte\./.test(q) && !/created_at|activated/.test(q), q.trim());
}

for (const f of failures) console.log(`  FAIL  ${f}`);
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
