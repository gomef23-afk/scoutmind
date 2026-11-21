// Round Recap, the data (R-1, 21 Nov 2026; migration 042).
//
//   node tests/round-recap.test.js
//
// - api/_lib/round-recap.js (pure): every line on a full round, each rule
//   (upset places and table, biggest win, top scorers, top rating minutes,
//   the tier that paid best, most picked needs two, best pick without the
//   captain bonus, who picked him, captain delivered, the top 3, the quiet
//   star only from 20 entries), and a missing input leaves its line OUT:
//   no null, NaN or empty list anywhere in a recap;
// - api/_lib/recap-job.js against a stubbed PostgREST: newest first, a round
//   with a recap or with data missing is skipped, history is stored as
//   posted, a new final round is not, insert-only, 0 API-Football requests,
//   and before 042 it reports instead of throwing;
// - player-stats: recaps after the results refresh and before the room posts;
// - 042: RLS with no policy and no browser grant, the readers open to guests,
//   posts never pinned, the switch off by default, 019's post kept for it,
//   recaps_from set once, nothing deleted.
// No dependencies.

import { readFileSync } from 'node:fs';
import { buildRecap, recapComplete, UPSET_PLACES } from '../api/_lib/round-recap.js';
import { SCORED_COLUMNS, TIER_MULTIPLIER, UNRANKED_MULTIPLIER } from '../api/_lib/scout-game.js';

let passed = 0;
const failures = [];
const check = (name, ok, detail) => { if (ok) passed++; else failures.push(detail ? `${name}\n      ${detail}` : name); };
const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`);
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

// ── 1. The builder ──
// Four matches: 10 v 20 (4-0), 11 v 21 (1-2: 21 sat 8 places below 11), 12 v 22 (0-0), 13 v 23 (3-1).
const FX = [
  { id: 1, home_team_id: 10, away_team_id: 20, home_goals: 4, away_goals: 0, status_short: 'FT', kickoff_utc: '2026-11-21T15:00:00Z', players_fetched_at: 'x' },
  { id: 2, home_team_id: 11, away_team_id: 21, home_goals: 1, away_goals: 2, status_short: 'FT', kickoff_utc: '2026-11-21T17:00:00Z', players_fetched_at: 'x' },
  { id: 3, home_team_id: 12, away_team_id: 22, home_goals: 0, away_goals: 0, status_short: 'FT', kickoff_utc: '2026-11-22T15:00:00Z', players_fetched_at: 'x' },
  { id: 4, home_team_id: 13, away_team_id: 23, home_goals: 3, away_goals: 1, status_short: 'AET', kickoff_utc: '2026-11-22T17:00:00Z', players_fetched_at: 'x' },
];
const row = (fixture_id, player_id, team_id, o = {}) => ({ fixture_id, player_id, team_id, position: 'F', minutes: 90, goals: 0, assists: 0,
  clean_sheet: false, goals_conceded: null, saves: 0, pen_saved: 0, shots_on: 0, passes_key: 0, pen_missed: 0, yellow: 0, red: 0, rating: null, ...o });
const ROWS = [
  row(1, 100, 10, { goals: 2, shots_on: 3, rating: 8.9 }),   // 2 goals
  row(1, 101, 10, { goals: 2, rating: 9.6, minutes: 20 }),   // 2 goals, best rating but a cameo
  row(1, 102, 20, { rating: 6.1 }),
  row(2, 200, 21, { goals: 1, assists: 1, rating: 8.4 }),
  row(3, 300, 12, { position: 'G', clean_sheet: true, goals_conceded: 0, saves: 6, rating: 7.9 }),
  row(4, 400, 13, { goals: 1, rating: 7.0 }),
];
const SNAP = { date: '2026-11-20', rows: [
  { team_id: 10, rank: 3, group_label: null }, { team_id: 20, rank: 15, group_label: null },
  { team_id: 11, rank: 2, group_label: null }, { team_id: 21, rank: 2 + UPSET_PLACES, group_label: null },
  { team_id: 12, rank: 1, group_label: null }, { team_id: 22, rank: 20, group_label: null },
  { team_id: 13, rank: 18, group_label: 'A' }, { team_id: 23, rank: 1, group_label: 'B' },   // 13 beat a leader, but another table
] };
// Tiers: 12 players per group for tiers 5 and 1, from the round's clubs.
const TIERS = [];
for (let i = 0; i < 12; i++) TIERS.push({ player_id: i < 1 ? 100 : 1000 + i, team_id: 10, tier: 5 });
for (let i = 0; i < 12; i++) TIERS.push({ player_id: 2000 + i, team_id: 20, tier: 1 });
const LADDER = { tiers: TIER_MULTIPLIER, unranked: UNRANKED_MULTIPLIER };
// Three entries: e1 (u1) picks 100 (captain), 200, 300, 400, 102; e2 (u2) picks 100, 200 (captain), …; e3 (u3) picks 200 only, captain.
const ENTRIES = [{ id: 1, user_id: 'u1', submitted_at: '2026-11-20T10:00:00Z' }, { id: 2, user_id: 'u2', submitted_at: '2026-11-20T09:00:00Z' },
  { id: 3, user_id: 'u3', submitted_at: '2026-11-20T11:00:00Z' }];
const P = (entry_id, slot, player_id, is_captain, m) => ({ entry_id, slot, player_id, is_captain, locked_multiplier: m });
const PICKS = [P(1, 1, 300, false, 1.1), P(1, 2, 100, true, 1), P(1, 3, 200, false, 1.4), P(1, 4, 400, false, 1.2), P(1, 5, 102, false, 1.05),
  P(2, 1, 300, false, 1.1), P(2, 2, 100, false, 1), P(2, 3, 200, true, 1.4), P(3, 1, 200, true, 1.4)];
// Scored base as the game stored it (the job's numbers), per entry and slot.
// 100 has the most base points, but 200's tier multiplier puts him ahead: 22 x 1.4 = 30.8 > 30.6 x 1.
const BASE = { 100: 30.6, 200: 22, 300: 16.5, 400: 12, 102: 0 };
const SCORES = PICKS.map((p) => ({ entry_id: p.entry_id, slot: p.slot, base_points: BASE[p.player_id] }));
const RESULTS = [{ user_id: 'u1', total: 120.4, captain_points: 61.2, submitted_at: '2026-11-20T10:00:00Z' },
  { user_id: 'u2', total: 95, captain_points: 52.2, submitted_at: '2026-11-20T09:00:00Z' },
  { user_id: 'u3', total: 52.2, captain_points: 52.2, submitted_at: '2026-11-20T11:00:00Z' }];
const full = { fixtures: FX, rows: ROWS, snapshot: SNAP, tiers: TIERS, ladder: LADDER, entries: ENTRIES, picks: PICKS, scores: SCORES, results: RESULTS, minParticipants: 20 };
const { data: D, people } = buildRecap(full);

eq('matches: played and goals', [D.matches.played, D.matches.goals], [4, 11]);
eq('matches: every result, by kick-off', D.matches.results.map((r) => r.f), [1, 2, 3, 4]);
eq('biggest win: the largest margin', D.matches.big_wins, [{ f: 1, h: 10, a: 20, hg: 4, ag: 0 }]);
eq(`upset: the winner ${UPSET_PLACES}+ places below, same table; a leader beaten from another table is not one`, D.matches.upsets, [{ f: 2, w: 21, l: 11, wr: 10, lr: 2 }]);
eq('…with the snapshot it came from', D.matches.snapshot_date, '2026-11-20');
eq('top scorers: the most goals, ties by points, and who', [D.players.top_scorers.goals, D.players.top_scorers.ids, D.players.top_scorers.more], [2, [100, 101], undefined]);
eq('top rating: 45 minutes or more (the 9.6 cameo is out)', D.players.top_rating, { id: 100, rating: 8.9, minutes: 90 });
check('the tier that paid best: tier 5 here (a player of tier 5 scored), with its mean and size', D.tiers && D.tiers.best.tier === 5 && D.tiers.best.n === 12);
eq('most picked: picked by most entries, ties by points', D.game.most_picked, { id: 200, base: 22 });
eq('best pick: points at his tier multiplier, NO captain bonus (e2 and e3 captained him), shared by everyone who picked him',
  D.game.best_pick, { id: 200, base: 22, multiplier: 1.4, points: 30.8, by: ['u2', 'u1'], fans: 3 });
eq('captain delivered = the captain was the fan\'s best-scoring pick (e1: 100 yes; e2: 200 no, 100 beat him; e3: alone, yes)', D.game.captains, { delivered: 2, of: 3 });
eq('the round\'s top 3, by total then captain points', D.game.top3.map((x) => [x.u, x.rank]), [['u1', 1], ['u2', 2], ['u3', 3]]);
check('no quiet star under 20 entries', !('quiet_star' in D.players));
eq('the entries count', D.game.entries, 3);
check('every player named is listed with his club, for the names', [100, 101, 200].every((id) => people.has(id)) && people.get(100) === 10);

// A missing value is never filled: walk every recap for null, NaN, undefined or an empty list.
function holes(x, path = '') {
  if (x === null || x === undefined || (typeof x === 'number' && !Number.isFinite(x))) return [path || '(root)'];
  if (Array.isArray(x)) return x.length ? x.flatMap((v, i) => holes(v, `${path}[${i}]`)) : [path + '[]'];
  if (typeof x === 'object') return Object.entries(x).filter(([, v]) => v !== undefined).flatMap(([k, v]) => holes(v, path ? `${path}.${k}` : k));
  return [];
}
eq('a full recap has no holes', holes(D), []);
const bare = buildRecap({ fixtures: FX.map((f) => ({ ...f, home_goals: 1, away_goals: 1 })) }).data;
eq('only draws, no rows, no snapshot, no tiers, no fans: just the matches', Object.keys(bare), ['v', 'matches']);
eq('…and no biggest win, no upset', Object.keys(bare.matches), ['played', 'goals', 'results']);
eq('…and still no holes', holes(bare), []);
for (const drop of ['rows', 'snapshot', 'tiers', 'entries', 'picks', 'scores', 'results']) {
  const d = buildRecap({ ...full, [drop]: drop === 'snapshot' || drop === 'tiers' ? null : [] }).data;
  eq(`without ${drop}: the recap has no holes`, holes(d), []);
}
check('without a snapshot: no upset line', !('upsets' in buildRecap({ ...full, snapshot: null }).data.matches));
check('without fans: no game section at all', !('game' in buildRecap({ ...full, entries: [] }).data));
check('one tier only (no comparison): no tier line', !('tiers' in buildRecap({ ...full, tiers: TIERS.filter((t) => t.tier === 5) }).data));
check('a player picked once is never "most picked"', !('most_picked' in buildRecap({ ...full, picks: PICKS.filter((p) => p.entry_id === 1), entries: ENTRIES.slice(0, 1) }).data.game));
check('a best pick that scored nothing is not shown', !('best_pick' in buildRecap({ ...full, scores: SCORES.map((s) => ({ ...s, base_points: 0 })) }).data.game));
{
  // 20 entries: a top-10 scorer nobody picked becomes the quiet star; the share is never stored.
  const many = Array.from({ length: 20 }, (_, i) => ({ id: 100 + i, user_id: `x${i}`, submitted_at: '2026-11-20T10:00:00Z' }));
  const mp = many.map((e) => P(e.id, 1, 200, true, 1.4));
  const d = buildRecap({ ...full, entries: many, picks: mp, scores: mp.map((p) => ({ entry_id: p.entry_id, slot: 1, base_points: 22 })), results: [] }).data;
  check('20 entries: the quiet star is a top-10 scorer few picked', d.players.quiet_star && d.players.quiet_star.id === 100 && !('share' in d.players.quiet_star) && !('picks' in d.players.quiet_star));
  check('…and the best pick shows two fans and how many', d.game.best_pick.by.length === 2 && d.game.best_pick.fans === 20);
}
check('ownership is never stored as a count or a share', !/"(picks|share|ownership|count)"/.test(JSON.stringify(D)));
check('recapComplete: every counting fixture played with rows, or not played', recapComplete(FX) && recapComplete([...FX, { status_short: 'PST' }])
  && !recapComplete([...FX, { status_short: 'FT', players_fetched_at: null }]) && !recapComplete([...FX, { status_short: 'NS' }])
  && !recapComplete([{ status_short: 'PST' }]) && !recapComplete([]));

// ── 2. The job, against a stubbed PostgREST ──
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_test';
const res = (body, status = 200) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body), headers: { get: () => null } });
async function job(world = {}) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = decodeURIComponent(String(url));
    const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ method, url: u, body, prefer: (init.headers || {}).Prefer });
    const table = (/\/rest\/v1\/(\w+)/.exec(u) || [])[1];
    if (world.missing && table === 'round_recaps') return res({ code: '42P01', message: 'relation "public.round_recaps" does not exist' }, 404);
    if (u.includes('/rpc/player_tiers_at')) return res(TIERS);
    if (method === 'POST') return res(null, 201);
    switch (table) {
      case 'game_rounds': return res([
        { id: 9, league_id: 1, season: 2026, round_no: 35, round_label: 'Regular Season - 35', deadline_utc: '2026-11-21T15:00:00Z', finalized_at: '2026-11-21T21:31:00Z' },
        { id: 8, league_id: 1, season: 2026, round_no: 34, round_label: 'Regular Season - 34', deadline_utc: '2026-11-14T15:00:00Z', finalized_at: null },
        { id: 7, league_id: 1, season: 2026, round_no: 33, round_label: 'Regular Season - 33', deadline_utc: '2026-11-07T15:00:00Z', finalized_at: null },
        { id: 6, league_id: 1, season: 2026, round_no: 32, round_label: 'Regular Season - 32', deadline_utc: '2026-10-31T15:00:00Z', finalized_at: null }]);
      case 'round_recaps': return res([{ round_id: 6 }]);
      case 'game_config': return res([{ id: true, recaps_from: '2026-11-21T20:00:00Z', recap_posts: false }]);
      case 'game_round_fixtures': return res(/round_id=eq\.7/.test(u) ? [{ fixture_id: 99 }] : FX.map((f) => ({ fixture_id: f.id })));
      case 'fixtures': return res(/id=in\.\(99\)/.test(u) ? [{ ...FX[0], id: 99, players_fetched_at: null }] : FX);
      case 'player_fixture_stats': return res(ROWS);
      case 'fixture_events': return res([]);
      case 'standings_snapshots': return res(/select=snapshot_date/.test(u) ? [{ snapshot_date: '2026-11-20' }] : SNAP.rows);
      case 'game_entries': return res(/round_id=eq\.9/.test(u) ? ENTRIES : []);
      case 'game_picks': return res(PICKS);
      case 'game_pick_scores': return res(SCORES);
      case 'game_round_results': return res(RESULTS);
      case 'players': return res([100, 101, 200, 300].map((id) => ({ id, name: `Player ${id}` })));
      default: return res([]);
    }
  };
  const { buildDueRecaps } = await import('../api/_lib/recap-job.js?' + Math.random());
  return { out: await buildDueRecaps(world.opts || { max: 10 }), calls };
}
{
  const { out, calls } = await job();
  const ins = calls.filter((c) => c.method === 'POST' && /\/rest\/v1\/round_recaps/.test(c.url));
  eq('built 35 and 34; 33 is waiting for player rows; 32 already has one', [out.built, out.incomplete, out.pending, out.error], [2, 1, 0, undefined]);
  eq('newest first', ins.map((c) => c.body[0].round_id), [9, 8]);
  check('insert-only: a recap is never overwritten', ins.every((c) => /resolution=ignore-duplicates/.test(c.prefer) && /on_conflict=round_id/.test(c.url)));
  const r35 = ins[0] && ins[0].body[0], r34 = ins[1] && ins[1].body[0];
  check('a round final after recaps began can be posted (posted_at null)', r35 && r35.posted_at === null);
  check('history (no finalized_at, or before recaps began) is stored as posted: never a room post', r34 && typeof r34.posted_at === 'string');
  check('the stored recap carries the game section and the player names', r35 && r35.data.game.best_pick.id === 200 && r35.data.people['200'].name === 'Player 200' && r35.data.people['200'].team === 21);
  check('no fan name is stored, only user ids', r35 && !/Felipe|name":"u1/.test(JSON.stringify(r35.data)) && r35.data.game.top3[0].u === 'u1');
  check('standings: the last snapshot before the deadline\'s day', calls.some((c) => /standings_snapshots\?select=snapshot_date&.*snapshot_date=lt\.2026-11-21/.test(c.url)));
  check('the job reads the scoring columns the game scores with', calls.some((c) => /player_fixture_stats\?select=fixture_id,player_id,team_id,rating,/.test(c.url) && c.url.includes(SCORED_COLUMNS.join(','))));
  check('0 API-Football requests', !calls.some((c) => /api-sports|api-football/.test(c.url)));
  check('nothing deleted', !calls.some((c) => c.method === 'DELETE'));
}
{
  const { out } = await job({ opts: { max: 1 } });
  eq('max: one a run (player-stats); the other two wait', [out.built, out.pending], [1, 2]);
}
{
  const { out } = await job({ missing: true });
  check('before 042: reported, never thrown', out.built === 0 && /round_recaps/.test(out.error || ''));
}

// ── 3. player-stats and the backfill endpoint ──
const ps = read('api/cron/player-stats.js');
check('player-stats: recaps after the results refresh, before the room posts',
  /refresh_game_results[\s\S]*?if \(recaps\) out\.recaps = await buildDueRecaps\(recaps\);[\s\S]*?rpc\('post_round_messages'\)/.test(ps));
check('player-stats: one recap a run, inside the window', /gameScores\(ingestedFixtureIds, locks, \{ recaps: \{ max: 1, until: started \+ RUN_BUDGET_MS \} \}\)/.test(ps));
check('player-stats: scores with SCORED_COLUMNS (one list for the game and the recap)', /select=fixture_id,player_id,\$\{SCORED_COLUMNS\.join\(','\)\}/.test(ps));
const ep = read('api/cron/recaps.js');
check('/api/cron/recaps: behind the cron secret, the 20 s window, 0 requests', /withCron\('recaps'/.test(ep) && /until: started \+ RUN_BUDGET_MS/.test(ep) && /requests_used: 0/.test(ep));

// ── 4. Migration 042 ──
const sql = read('supabase/migrations/042_round_recaps.sql');
const body = sql.split('-- VERIFY')[0];
check('042: the table, RLS on, no policy, no browser grant', /create table if not exists public\.round_recaps/.test(body) && /alter table public\.round_recaps enable row level security;/.test(body)
  && /revoke all on public\.round_recaps from anon, authenticated;/.test(body) && !/create policy/i.test(body) && !/grant [^;]*on public\.round_recaps/i.test(body));
check('042: the readers are security definer and open to guests', /function public\.round_recap\(p_round_id bigint\)[\s\S]*?security definer/.test(body)
  && /grant execute on function public\.round_recap\(bigint\) to anon, authenticated, service_role;/.test(body)
  && /grant execute on function public\.recent_round_recaps\(bigint, integer\) to anon, authenticated, service_role;/.test(body));
check('042: private-league top 3 only for the reader\'s own active memberships', /me\.user_id = v_uid and me\.left_at is null and me\.removed_at is null/.test(body));
check('042: names come from public_profiles when read', /'names', \(select coalesce\(jsonb_object_agg\(p\.id, p\.name\)/.test(body));
check('042: posts are the job\'s only', /revoke all on function public\.post_round_messages\(\) from public, anon, authenticated;/.test(body) && /grant execute on function public\.post_round_messages\(\) to service_role;/.test(body));
check('042: a recap post is never pinned', /values \(v_room, null, v_body, false, true\)/.test(body) && !/v_body, true/.test(body));
check('042: switch off by default; off = 019\'s torcida post, and every final recap marked posted', /recap_posts boolean not null default false/.test(body)
  && /if not coalesce\(v_on, false\) then[\s\S]*?' is final\. Top of the ' \|\| t\.name \|\| ' torcida in the Scout Game: '[\s\S]*?set posted_at = now\(\)[\s\S]*?return v_posts;\s*end if;/.test(body));
check('042: 019\'s post text unchanged', read('supabase/migrations/019_scout_game_reads.sql').includes("' is final. Top of the ' || t.name || ' torcida in the Scout Game: ' || r.top3 || ' pts.'"));
check('042: Portuguese first, then English, within 500 characters', /v_body := v_pt \|\|[\s\S]*?\|\| ' · ' \|\| v_en/.test(body) && /char_length\(v_body\) > 500/.test(body));
check('042: recaps_from set once', /update public\.game_config set recaps_from = now\(\) where id and recaps_from is null;/.test(body));
check('042: re-runnable, nothing deleted or dropped', !/\bdelete from\b|\bdrop (table|function|column)\b|\btruncate\b/i.test(body) && /^begin;/m.test(body) && /^commit;/m.test(body));

// ── 5. Copy ──
const files = ['api/_lib/round-recap.js', 'api/_lib/recap-job.js', 'api/cron/recaps.js', 'supabase/migrations/042_round_recaps.sql'];
const banned = [['od', 'ds'].join(''), ['b', 'et'].join(''), ['win', ' money'].join(''), ['pri', 'ze'].join('')];
const hits = [];
for (const f of files) for (const w of banned) if (new RegExp(`\\b${w}\\b`, 'i').test(read(f))) hits.push(`${f}: ${w}`);
eq('no money language in any recap file', hits, []);

for (const f of failures) console.log(`  FAIL  ${f}`);
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
