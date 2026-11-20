// player-stats must never stop on one fixture (20 Nov 2026).
//
//   node tests/player-stats-resilience.test.js
//
// From 19-20 Nov 2026 /api/cron/player-stats returned 500 on every run and
// cron-job.org disabled it: no Scout Game scoring for ~14 h. The queue held
// 14 fixtures, one request chunk. In it:
//   * 1520972 (Série B, CRB 1-1 Ceará): API-Football gave ONE id (80184) to two
//     Ceará players, goalkeeper Richard #1 and midfielder Richard #40. Two rows
//     on one (fixture_id, player_id) key → Postgres refuses the whole batch
//     upsert ("ON CONFLICT DO UPDATE command cannot affect row a second time")
//     → the run threw before marking anything, and the same chunk came back
//     every 15 minutes, three Série A matches of 19 Nov behind it.
//   * 1649492 (MLS Round of 32, Seattle 1-1 Real Salt Lake, 2-4 on penalties):
//     the eight shoot-out kicks are Goal events, so the events said 3-5 against
//     a 1-1 score. That was only a warning, but it is wrong, and the cup model
//     needs it right.
// The real payloads are frozen in tests/fixtures/api-football/
// fixtures_ids_pen_dup.json (1649492, 1520972, 1492458 Série A 2-1). The real
// handler runs against a stubbed API-Football and a stubbed PostgREST that
// refuses a batch with a repeated conflict key, like Postgres. Covered:
// - parser: shoot-out kicks are not goals (1-1 matches; conceded and clean
//   sheet are computed again); extra-time goals still count; the duplicated id
//   is skipped (both lines) and counted as unidentified;
// - the job: the whole chunk is ingested; with a fixture the database refuses
//   anyway, the chunk is written one by one, the others are written, marked
//   and SCORED, the refused one is backed off (2 h, then 24 h, then left out),
//   and the run answers 200 with write_failures;
// - a goal mismatch never stops anything and the fixture is not retried;
// - fixture-stats has the same guard.
// No dependencies.

import { readFileSync } from 'node:fs';
import { parseFixture, isShootout } from '../api/_lib/players.js';

let passed = 0;
const failures = [];
const check = (name, ok, detail) => { if (ok) passed++; else failures.push(detail ? `${name}\n      ${detail}` : name); };
const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`);
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const PAYLOAD = JSON.parse(read('tests/fixtures/api-football/fixtures_ids_pen_dup.json'));
const byId = new Map(PAYLOAD.response.map((r) => [r.fixture.id, r]));
const PEN = byId.get(1649492), DUP = byId.get(1520972), SERIE_A = byId.get(1492458);

// ── 1. The parser ──
const pen = parseFixture(PEN);
check('the frozen payload is the real match: MLS, decided on penalties 2-4 after 1-1', PEN.league.id === 253 && PEN.fixture.status.short === 'PEN'
  && PEN.goals.home === 1 && PEN.goals.away === 1 && PEN.score.penalty.home === 2 && PEN.score.penalty.away === 4);
eq('eight shoot-out kicks in its events, all "Penalty Shootout"', PEN.events.filter(isShootout).length, 8);
eq('shoot-out kicks are not goals: the events now match the 1-1', pen.goalCheck, { ok: true, rule: 'all', events: { home: 1, away: 1 }, score: { home: 1, away: 1 } });
check('…so conceded and clean sheet are computed again (not null)', pen.rows.every((r) => r.goals_conceded !== null) && pen.rows.some((r) => r.goals_conceded === 1));
const gk = pen.rows.find((r) => r.position === 'G' && r.api_team_id === 1606 && r.minutes >= 90);
check('the winning goalkeeper conceded 1 (the 36\' goal), not 1 + 2 shoot-out goals', gk && gk.goals_conceded === 1 && gk.clean_sheet === false, JSON.stringify(gk && { c: gk.goals_conceded, cs: gk.clean_sheet }));
check('the shoot-out stays in the timeline (stored, marked by its comments)', pen.shootout === true && pen.events.filter((e) => e.comments === 'Penalty Shootout').length === 8);
check('the players\' own goals already leave the shoot-out out (only the two real scorers)', pen.rows.filter((r) => r.goals > 0).length === 2);
// Extra time counts: the same match as if both 90-minute goals had come in extra time.
const aet = JSON.parse(JSON.stringify(PEN));
aet.fixture.status.short = 'AET';
for (const e of aet.events) if (e.type === 'Goal' && !isShootout(e) && e.detail === 'Normal Goal') e.time.elapsed = 105;
eq('extra-time goals still count towards the score', parseFixture(aet).goalCheck.events, { home: 1, away: 1 });
check('"Penalty Shootout" is matched however it is spelled, and nothing else is', isShootout({ comments: 'Penalty Shoot-out' }) && isShootout({ comments: 'penalty shootout' })
  && !isShootout({ comments: null }) && !isShootout({ comments: 'Penalty awarded' }));

const dup = parseFixture(DUP);
const dupLines = DUP.players.flatMap((s) => s.players).filter((p) => p.player.id === 80184 && p.statistics[0].games.minutes > 0);
check('the frozen payload has id 80184 twice for Ceará, two different players (lineup: #1 G and #40 M)', dupLines.length === 2
  && DUP.lineups.flatMap((l) => l.startXI).filter((x) => x.player.id === 80184).map((x) => x.player.pos).sort().join() === 'G,M');
check('both lines are skipped: no row for 80184, one row per key', !dup.rows.some((r) => r.api_player_id === 80184)
  && new Set(dup.rows.map((r) => r.api_player_id)).size === dup.rows.length);
const noId = DUP.players.flatMap((s) => s.players).filter((p) => !p.player.id && p.statistics[0].games.minutes > 0).length;   // the API's id-0 players, skipped as before
eq('…reported, and both lines counted as unidentified (on top of the id-0 ones)', [dup.duplicateIds, dup.unidentified], [[80184], noId + 2]);
check('a clean fixture is untouched', parseFixture(SERIE_A).duplicateIds.length === 0 && parseFixture(SERIE_A).goalCheck.ok && parseFixture(SERIE_A).unidentified === 0);

// ── 2. The job ──
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_test';
process.env.API_FOOTBALL_KEY = 'af_test';
process.env.CRON_SECRET = 'cron_test';
const res = (body, status = 200, range) => ({ ok: status < 300, status, json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  headers: { get: (h) => (/remaining/i.test(h) ? '7000' : /limit/i.test(h) ? '7500' : /content-range/i.test(h) ? (range || '0-0/0') : null) } });
const KEYS = { player_fixture_stats: ['fixture_id', 'player_id'], fixture_events: ['fixture_id', 'seq'], players: ['api_player_id'] };
const QUEUE = [{ id: 1, api_fixture_id: 1649492, season: 2026, players_attempts: 0 }, { id: 2, api_fixture_id: 1520972, season: 2026, players_attempts: 0 },
  { id: 3, api_fixture_id: 1492458, season: 2026, players_attempts: 0 }];
const TEAM_IDS = [...new Set(PAYLOAD.response.flatMap((r) => [r.teams.home.id, r.teams.away.id]))];
const PICK_PLAYER = parseFixture(SERIE_A).rows.find((r) => r.started).api_player_id;

/** One run. world.refuse = fixture ids whose rows the database refuses (whatever the reason). */
async function run(world = {}) {
  const calls = [];
  const written = { player_fixture_stats: [], fixture_events: [], game_pick_scores: [] };
  globalThis.fetch = async (url, init = {}) => {
    const method = init.method || 'GET';
    const u = decodeURIComponent(String(url));
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ method, url: u, body });
    if (u.includes('api-sports.io')) {
      const ids = ((/[?&]ids=([\d-]+)/.exec(u) || [])[1] || '').split('-').map(Number);
      return res({ errors: [], response: ids.map((id) => byId.get(id)).filter(Boolean) });
    }
    const table = (/\/rest\/v1\/([\w]+)/.exec(u) || [])[1];
    if (u.includes('/rest/v1/rpc/')) {
      const fn = (/rpc\/(\w+)/.exec(u) || [])[1];
      return res(fn === 'lock_due_rounds' ? [] : 0);
    }
    if (table === 'ingest_runs') return method === 'POST' ? res([{ id: 1 }], 201) : res(null, 204);
    if (method === 'POST' && KEYS[table]) {
      // Postgres: a batch that hits one conflict key twice is refused whole.
      const k = (r) => KEYS[table].map((c) => r[c]).join(':');
      const keys = body.map(k);
      if (new Set(keys).size !== keys.length) return res({ code: '21000', message: 'ON CONFLICT DO UPDATE command cannot affect row a second time' }, 500);
      if ((world.refuse || []).some((fid) => body.some((r) => r.fixture_id === fid))) return res({ code: '23503', message: 'refused for the test' }, 409);
      if (written[table]) written[table].push(...body);
      return res(null, 201);
    }
    if (method === 'POST' && table === 'game_pick_scores') { written.game_pick_scores.push(...body); return res(null, 201); }
    if (method === 'PATCH') return res(null, 204);
    if (method === 'POST') return res(null, 201);
    // GETs
    if (table === 'leagues') return res([{ id: 22, api_league_id: 253, slug: 'mls', current_season: 2026, playable: false }, { id: 18, api_league_id: 72, slug: 'serie_b', current_season: 2026, playable: false },
      { id: 1, api_league_id: 71, slug: 'serie_a', current_season: 2026, playable: true }]);
    if (table === 'teams') return res(TEAM_IDS.map((api, i) => ({ id: 500 + i, api_team_id: api })));
    if (table === 'fixtures') return /select=id&limit=1/.test(u) ? res([], 200, `*/${world.backlog ?? 0}`) : res(QUEUE);
    if (table === 'players') {
      const ids = ((/api_player_id=in\.\(([^)]*)\)/.exec(u) || [])[1] || '').split(',').filter(Boolean).map(Number);
      if (ids.length) return res(ids.map((id) => ({ id, api_player_id: id })));
      const own = ((/id=in\.\(([^)]*)\)/.exec(u) || [])[1] || '').split(',').filter(Boolean).map(Number);
      return res(own.map((id) => ({ id, api_player_id: id })));
    }
    if (table === 'game_round_fixtures') {
      if (/fixture_id=in\.\(/.test(u)) return res(/fixture_id=in\.\([^)]*\b3\b/.test(u) ? [{ round_id: 50 }] : []);
      return res([{ round_id: 50, fixture_id: 3 }]);
    }
    if (table === 'game_rounds') return res([{ id: 50, status: 'locked' }]);
    if (table === 'game_picks') return res([{ entry_id: 1, slot: 1, round_id: 50, player_id: PICK_PLAYER, is_captain: true, locked_tier: 'A', locked_multiplier: 1, locked_contrarian: false }]);
    if (table === 'player_fixture_stats') return res(written.player_fixture_stats.filter((r) => r.fixture_id === 3 && r.player_id === PICK_PLAYER));
    return res([]);
  };
  const mod = await import('../api/cron/player-stats.js?' + Math.random());
  const out = { code: 0, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  await mod.default({ url: '/api/cron/player-stats', headers: { authorization: 'Bearer cron_test' } }, out);
  return { out, calls, written };
}
const doneOf = (calls) => calls.filter((c) => c.method === 'PATCH' && /\/rest\/v1\/fixtures\?id=in\./.test(c.url) && c.body.players_fetched_at)
  .flatMap((c) => /id=in\.\(([^)]*)\)/.exec(c.url)[1].split(',').map(Number)).sort();
const backoffOf = (calls) => calls.filter((c) => c.method === 'PATCH' && /\/rest\/v1\/fixtures\?id=eq\./.test(c.url) && !c.body.players_fetched_at);

// a) The chunk of 19-20 Nov, with the fixes: everything goes in.
const a = await run();
const A = a.out.body || {};
check('the stuck chunk now runs: 200, all three ingested in one write', a.out.code === 200 && A.ok !== false && A.fixtures_ingested === 3, JSON.stringify(A).slice(0, 400));
eq('all three marked done', doneOf(a.calls), [1, 2, 3]);
eq('the duplicated id is reported, nothing failed, no goal mismatch left', [A.duplicate_ids, A.write_failures, A.goal_mismatches], [[{ fixture: 1520972, players: [80184] }], [], []]);
check('…and the Série A round behind it is scored', (A.game || {}).rounds_scored === 1 && a.written.game_pick_scores.length === 1 && a.written.game_pick_scores[0].fixture_id === 3,
  JSON.stringify(A.game));

// b) A fixture the database refuses anyway: the rest are written, marked and scored.
const b = await run({ refuse: [2] });
const Bd = b.out.body || {};
check('one refused fixture: the run still answers 200', b.out.code === 200 && Bd.ok !== false, JSON.stringify(Bd).slice(0, 400));
eq('…the other two are written and marked done', doneOf(b.calls), [1, 3]);
check('…the refused one is backed off (attempt 1, retry in 2 h), never marked done', (() => {
  const p = backoffOf(b.calls).find((c) => /id=eq\.2(&|$)/.test(c.url));
  return p && p.body.players_attempts === 1 && Date.parse(p.body.players_retry_after) - Date.now() > 1.9 * 3600e3 && !doneOf(b.calls).includes(2);
})(), JSON.stringify(backoffOf(b.calls).map((c) => [c.url, c.body])));
eq('…and reported with the database\'s reason', (Bd.write_failures || []).map((f) => f.fixture), [1520972]);
check('…the season refresh covers only the written ones', b.calls.filter((c) => /rpc\/refresh_player_season_stats/.test(c.url)).some((c) => JSON.stringify(c.body.p_fixture_ids.slice().sort()) === '[1,3]'));
check('…and the Scout Game still scores the Série A round', (Bd.game || {}).rounds_scored === 1 && b.written.game_pick_scores.length === 1, JSON.stringify(Bd.game));

// c) Before the parser fix this chunk failed whole: prove the stub would refuse it.
const raw = parseFixture(DUP);
check('the stub refuses a repeated key like Postgres (the 19-20 Nov failure mode)', (() => { const rows = [{ fixture_id: 2, player_id: 80184 }, { fixture_id: 2, player_id: 80184 }]; return new Set(rows.map((r) => r.fixture_id + ':' + r.player_id)).size !== rows.length; })() && raw.rows.length > 0);

// ── 3. The code itself ──
const src = read('api/cron/player-stats.js');
check('a refused chunk is written fixture by fixture; a refused fixture is backed off, never thrown',
  /catch \(e\) \{\s*console\.warn\(`\[player-stats\] chunk write failed/.test(src) && /await recordAttempt\(item\.fx, 'write_failed'\);/.test(src));
check('a failed season refresh is reported, never thrown', /refreshErrors\.push\(/.test(src));
check('a goal mismatch is a warning: the fixture is still marked done (not retried)', /goalMismatches\.push\(fx\.api_fixture_id\);/.test(src) && !/goalCheck\.ok\)\s*(throw|continue)/.test(src));
const fsrc = read('api/cron/fixture-stats.js');
check('fixture-stats: a refused write is backed off, never thrown; one row per team', /await recordAttempt\(fx, 'write_failed'\);/.test(fsrc)
  && /rows\.some\(\(r\) => r\.team_id === localId\)/.test(fsrc) && /write_failures: writeFailures/.test(fsrc));

for (const f of failures) console.log(`  FAIL  ${f}`);
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
