// Every cron job behind one serverless function (24 Nov 2026).
//
//   node tests/cron-dispatch.test.js
//
// The deploy of 23 Nov was refused: "No more than 12 Serverless Functions can
// be added to a Deployment" (Vercel Hobby; every .js file under api/ is one,
// except names starting with an underscore). The handlers moved to api/_cron/
// and api/cron/[job].js dispatches on the job name. Covered:
// - the function count (<= 8, so there is headroom under the cap of 12);
// - every handler file in api/_cron/ is a job, and every job is a file;
// - every existing URL reaches its own handler, and the handler still
//   refuses a request without the Bearer secret (401);
// - the request reaches the handler as it came (query string included):
//   /api/cron/teams?coaches=1, ?league=, &full=1;
// - Vercel's req.query.job and a bare path both work; an unknown or crafted
//   name is a 404 and loads nothing;
// - nothing is left in api/cron/ but the dispatcher.
// No dependencies.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

let passed = 0;
const failures = [];
const check = (name, ok, detail) => { if (ok) passed++; else failures.push(detail ? `${name}\n      ${detail}` : name); };
const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`);
const dir = (p) => new URL('../' + p, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

// ── 1. How many serverless functions Vercel builds ──
// A .js file under api/ whose path has no segment starting with "_".
const functions = [];
(function walk(d, rel) {
  for (const f of readdirSync(d)) {
    const p = join(d, f), r = rel ? `${rel}/${f}` : f;
    if (f.startsWith('_')) continue;
    if (statSync(p).isDirectory()) walk(p, r);
    else if (/\.(js|mjs|cjs|ts)$/.test(f)) functions.push(`api/${r}`);
  }
})(dir('api'), '');
eq('the serverless functions: the cron dispatcher, account deletion, email unsubscribe', functions.sort(),
  ['api/account/delete.js', 'api/cron/[job].js', 'api/email/unsubscribe.js']);
check(`${functions.length} functions: <= 8, headroom under Hobby's 12`, functions.length <= 8);
eq('api/cron/ holds the dispatcher only', readdirSync(dir('api/cron')), ['[job].js']);

// ── 2. Every handler is a job, every job a handler ──
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_test';
process.env.API_FOOTBALL_KEY = 'af_test';
process.env.CRON_SECRET = 'cron_test';
const dispatch = await import('../api/cron/[job].js');
const handlers = readdirSync(dir('api/_cron')).filter((f) => f.endsWith('.js')).map((f) => f.replace(/\.js$/, ''));
eq('every file in api/_cron/ is a job, and nothing else', [...dispatch.JOB_NAMES].sort(), handlers.sort());
check('the jobs cron-job.org calls, and the two new ones, are all there',
  ['fixtures', 'standings', 'live', 'teams', 'fixture-stats', 'player-stats', 'players', 'news', 'reminders', 'health', 'rescore', 'recaps']
    .every((j) => dispatch.JOB_NAMES.includes(j)));
const src = readFileSync(dir('api/cron/[job].js'), 'utf8');
check('each job is imported by a literal path (Vercel traces and bundles it)',
  dispatch.JOB_NAMES.every((j) => src.includes(`() => import('../_cron/${j}.js')`)));

// ── 3. Routing and auth ──
const mkRes = () => ({ code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } });
const calls = [];
globalThis.fetch = async (url, init = {}) => {   // nothing may reach the network without the secret
  calls.push(String(url));
  return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
};
for (const job of dispatch.JOB_NAMES) {
  const res = mkRes();
  await dispatch.default({ url: `/api/cron/${job}`, query: { job }, headers: {} }, res);
  check(`/api/cron/${job} without the Bearer secret: its handler answers 401`, res.code === 401 && res.body && res.body.error === 'unauthorized', JSON.stringify([res.code, res.body]));
  const wrong = mkRes();
  await dispatch.default({ url: `/api/cron/${job}`, query: { job }, headers: { authorization: 'Bearer nope' } }, wrong);
  check(`/api/cron/${job} with a wrong secret: 401`, wrong.code === 401);
}
check('no request left the process without the secret', calls.length === 0, calls.join(' '));

for (const [url, name] of [['/api/cron/nope', 'nope'], ['/api/cron/..%2Fsupabase', '../supabase'], ['/api/cron/player-stats.js', 'player-stats.js'],
  ['/api/cron/__proto__', '__proto__'], ['/api/cron/toString', 'toString'], ['/api/cron/', '']]) {
  const res = mkRes();
  await dispatch.default({ url, query: name ? { job: name } : {}, headers: { authorization: 'Bearer cron_test' } }, res);
  check(`${url}: 404, nothing loaded`, res.code === 404 && res.body && res.body.error === 'unknown job', JSON.stringify([res.code, res.body]));
}

eq('the job name: Vercel\'s req.query.job, else the path', [
  dispatch.jobName({ url: '/api/cron/teams?coaches=1', query: { job: 'teams', coaches: '1' } }),
  dispatch.jobName({ url: '/api/cron/fixtures?league=championship&full=1' }),
  dispatch.jobName({ url: '/api/cron/live/' }),
], ['teams', 'fixtures', 'live']);

// The request reaches the handler as it came: same object, same URL and query.
{
  const seen = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = decodeURIComponent(String(url));
    seen.push(u);
    const j = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } });
    if (/ingest_runs/.test(u)) return (init.method === 'POST') ? j([{ id: 1 }], 201) : new Response(null, { status: 204 });
    if (/rest\/v1\/leagues/.test(u)) return j([{ id: 8, api_league_id: 40, slug: 'championship', name: 'Championship', current_season: 2026, playable: true, season_end: '2027-05-01', type: 'league' }]);
    if (/api-sports/.test(u)) return new Response(JSON.stringify({ errors: [], response: [] }), { status: 200, headers: { 'content-type': 'application/json', 'x-ratelimit-requests-remaining': '7000', 'x-ratelimit-requests-limit': '7500' } });
    return j([]);
  };
  const res = mkRes();
  const req = { url: '/api/cron/teams?league=championship', query: { job: 'teams', league: 'championship' }, headers: { authorization: 'Bearer cron_test' } };
  await dispatch.default(req, res);
  check('/api/cron/teams?league=championship: authorised, runs the teams job for that league only', res.code === 200 && res.body && res.body.ok === true
    && res.body.job === 'teams' && JSON.stringify(res.body.leagues) === '["championship"]', JSON.stringify([res.code, res.body]));
  check('…and asked API-Football for that league', seen.some((u) => /api-sports\.io\/teams\?league=40&season=2026/.test(u)), seen.filter((u) => /api-sports/.test(u)).join(' '));
}

// ── 4. vercel.json has nothing per function to follow the move ──
const vj = JSON.parse(readFileSync(dir('vercel.json'), 'utf8'));
check('vercel.json: no per-function settings, crons or rewrites under /api/cron to update', !vj.functions && !vj.crons
  && !JSON.stringify(vj.rewrites || []).includes('/api/cron') && !JSON.stringify(vj.redirects || []).includes('/api/cron'));

for (const f of failures) console.log(`  FAIL  ${f}`);
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
