// Every cron handler stops starting work in time for cron-job.org's 30 s
// timeout. Fluid Compute is on (Hobby, 300 s function limit), so cron-job.org
// is the real cap: the work window is 20 s.
//
//   node tests/cron-budget.test.js
//
// A run nobody waits for leaves no reliable result, and a resumable job whose
// cursor is not written redoes the same slice. The budget is ONE
// number (api/_lib/cron.js RUN_BUDGET_MS) that every paced handler derives
// from; one request in flight is bounded by REQUEST_TIMEOUT_MS. Also pins the
// NOT NULL guards of 16 Nov 2026: no handler upserts a row missing a required
// column. No dependencies.

import { readFileSync, readdirSync } from 'node:fs';

let passed = 0;
const failures = [];
const check = (name, ok, detail) => { if (ok) passed++; else failures.push(detail ? `${name}\n      ${detail}` : name); };
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

process.env.API_FOOTBALL_KEY = 'af_test';
const { RUN_LIMIT_MS, RUN_BUDGET_MS } = await import('../api/_lib/cron.js');
const { REQUEST_TIMEOUT_MS } = await import('../api/_lib/apifootball.js');
const CLOSING_MS = 1_000;   // the last upsert + the ingest_runs write

// ── 1. The arithmetic ──
check('the limit is cron-job.org\'s 30 s timeout', RUN_LIMIT_MS === 30_000);
check('the work window is 20 s', RUN_BUDGET_MS === 20_000);
check('budget + one request in flight + closing writes fit inside the limit',
  RUN_BUDGET_MS + REQUEST_TIMEOUT_MS + CLOSING_MS <= RUN_LIMIT_MS, `${RUN_BUDGET_MS} + ${REQUEST_TIMEOUT_MS} + ${CLOSING_MS}`);
const af = read('api/_lib/apifootball.js');
check('every API-Football call carries a timeout', /signal: AbortSignal\.timeout\(REQUEST_TIMEOUT_MS\)/.test(af));
check('a 429 is retried at most once, after at most 1 s', /attempt < 2/.test(af) && /const RETRY_429_MS = 1_000;/.test(af));

// ── 2. No handler keeps its own literal budget ──
const files = readdirSync(new URL('../api/_cron/', import.meta.url)).filter((f) => f.endsWith('.js'));
for (const f of files) {
  const src = read('api/_cron/' + f);
  const literal = [...src.matchAll(/const (\w*(?:BUDGET|START_BY)\w*)\s*=\s*([\d_]+)\s*;/g)];
  check(`${f}: no budget is a literal number`, literal.length === 0, literal.map((m) => m[0]).join(' | '));
  const budgets = [...src.matchAll(/const (\w*(?:BUDGET|START_BY)\w*)\s*=\s*([^;]+);/g)];
  for (const [, name, expr] of budgets) {
    const m = /^RUN_BUDGET_MS(?:\s*([-+])\s*([\d_]+))?$/.exec(expr.trim());
    check(`${f}: ${name} derives from RUN_BUDGET_MS`, !!m, expr.trim());
    if (m) {
      const v = RUN_BUDGET_MS + (m[1] === '-' ? -1 : 1) * Number((m[2] || '0').replace(/_/g, ''));
      check(`${f}: ${name} (${v} ms) + one request + closing writes fit inside 30 s`, v + REQUEST_TIMEOUT_MS + CLOSING_MS <= RUN_LIMIT_MS);
    }
  }
}

// ── 3. News: one feed fetch may not outlive the run, and no source starves ──
const news = read('api/_cron/news.js');
const fetchTimeout = Number((/const FETCH_TIMEOUT_MS = ([\d_]+);/.exec(news) || [])[1]?.replace(/_/g, ''));
const newsBudget = RUN_BUDGET_MS - Number((/WALL_CLOCK_BUDGET_MS = RUN_BUDGET_MS(?: - ([\d_]+))?;/.exec(news) || [])[1]?.replace(/_/g, '') || 0);
check('news: last feed started + its timeout + closing writes fit', fetchTimeout && newsBudget + fetchTimeout + CLOSING_MS <= RUN_LIMIT_MS, `${newsBudget} + ${fetchTimeout}`);
check('news: least recently fetched source first, so a tight budget rotates', /order=last_fetched_at\.asc\.nullsfirst,slug/.test(news));

// ── 4. No partial rows into NOT NULL tables (the 23502 of 16 Nov 2026) ──
const teams = read('api/_cron/teams.js');
// C-1: a cup's cup-only clubs are created INSERT-ONLY (ignoreDuplicates), never overwriting a club we hold.
check("teams.js: only refreshTeams upserts teams; a cup's clubs insert-only", (teams.match(/upsert\('teams'/g) || []).length === 2
  && /async function refreshTeams[\s\S]*?upsert\('teams', teamRows/.test(teams)
  && /async function cupOnlyClubs[\s\S]*?upsert\('teams', rows, 'api_team_id', \{ ignoreDuplicates: true \}\)/.test(teams));
check('teams.js: refreshTeams skips API teams without an id or a name', /filter\(\(r\) => r\.team\?\.id && r\.team\?\.name\)/.test(teams));
check('teams.js: the coach is a PATCH by teams.id', /await update\('teams', `id=eq\.\$\{Number\(t\.id\)\}`, \{ coach_name:/.test(teams));
const players = read('api/_cron/players.js');
check('players.js: entries without a name are skipped (players.name is NOT NULL)', /if \(!entry\.player\?\.id \|\| !entry\.player\?\.name\) continue;/.test(players));
const pl = read('api/_lib/players.js');
check('player-stats creates players with a name fallback', /name: player\.name \|\| `Player \$\{player\.id\}`/.test(pl));

// ── 5. Requests per day against the plan's 7,500 (18 leagues, 17 Nov 2026) ──
// A model, not a measurement (the measured numbers are in ingest_runs /
// /api/cron/health): per active league, from api/_lib/leagues.js
// requestsPerDay(), plus the jobs that do not scale with leagues: live
// (one live=all call every 10 minutes) and the hourly squads pass's
// fixed overhead are inside requestsPerDay or below.
const { LEAGUES, requestsPerDay } = await import('../api/_lib/leagues.js');
const LIVE_PER_DAY = 144;
const active = LEAGUES.filter((l) => l.active);
const perLeague = active.reduce((s, l) => s + requestsPerDay(l), 0);
const allEighteen = LEAGUES.reduce((s, l) => s + requestsPerDay({ ...l, active: true }), 0);
const PLAN = 7_500, CEILING = PLAN * 0.25;
check(`today's leagues (${active.length}): ${Math.round(perLeague + LIVE_PER_DAY)} requests a day, under a quarter of ${PLAN}`, perLeague + LIVE_PER_DAY < CEILING);
check(`all 18 active: ${Math.round(allEighteen + LIVE_PER_DAY)} requests a day, still under a quarter of ${PLAN}`, allEighteen + LIVE_PER_DAY < CEILING);
check('a tracked-only league costs no squad pages (players.js runs for playable leagues only)',
  requestsPerDay({ active: true, playable: false }) + 5 === requestsPerDay({ active: true, playable: true }));
check('Série C (no stats coverage) costs no fixture-stats requests', requestsPerDay({ active: true, playable: false, statsCoverage: false }) < requestsPerDay({ active: true, playable: false, statsCoverage: null }));
// The two daily jobs that loop over every league are paced (they were not
// before 18 leagues): budget, cursor, and a no-op once the day is done.
for (const f of ['fixtures', 'standings']) {
  const src = read(`api/_cron/${f}.js`);
  check(`${f}.js: time-boxed and resumable (rule 16)`, /export const TIME_BUDGET_MS = RUN_BUDGET_MS;/.test(src) && /dailyPass\('/.test(src) && /stopped_on: stopped \? 'time_budget' : null/.test(src));
}

for (const f of failures) console.log(`  FAIL  ${f}`);
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
