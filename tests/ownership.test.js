// The ownership multiplier, shadow stage (migration 029, 17 Nov 2026).
//
//   node tests/ownership.test.js
//
// - the ladder in scout-game.js: band edges, cap x1.4, the five tier words;
// - the minimum (20) and the switch (OWNERSHIP_LIVE false = shadow);
// - shadowScore(): same base points, the band's multiplier, captain, no
//   contrarian, null when unscored;
// - the stats job: syncs the ladder in its own write, calls the 029 lock with
//   it, falls back to the 017 lock (contrarian out of reach) on PGRST202 only,
//   and still runs every step when 029 has not run;
// - migration 029: the SQL ladder default equals the JS one, the shadow table
//   is closed to the browser, the band function says nothing while the switch
//   is off and returns bands only, contrarian is never set, other people's
//   picks open at the deadline, and it is re-runnable.
// No dependencies.

import { readFileSync } from 'node:fs';
import {
  OWNERSHIP_LADDER, OWNERSHIP_MIN_PARTICIPANTS, OWNERSHIP_LIVE, TIER_MULTIPLIER, UNRANKED_MULTIPLIER,
  ownershipBand, multiplierMode, shadowScore, scorePick,
} from '../api/_lib/scout-game.js';

let passed = 0;
const failures = [];
const check = (name, ok, detail) => { if (ok) passed++; else failures.push(detail ? `${name}\n      ${detail}` : name); };
const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}\n      want ${JSON.stringify(want)}`);
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

// ── The ladder ──
eq('band edges (>=30 / 15 / 7.5 / 3 / below)', [35, 30, 29.99, 15, 14.99, 7.5, 7.49, 3, 2.99, 0].map((p) => ownershipBand(p).tier), [5, 5, 4, 4, 3, 3, 2, 2, 1, 1]);
eq('multipliers per band', [50, 20, 10, 5, 1].map((p) => ownershipBand(p).multiplier), [1, 1.05, 1.1, 1.2, 1.4]);
check('nobody picked him (null / 0%) → Hidden gem ×1.40', ownershipBand(null).multiplier === 1.4 && ownershipBand(undefined).tier === 1);
check('cap: no band above ×1.4', Math.max(...OWNERSHIP_LADDER.map((b) => b.multiplier)) === 1.4);
check('the five bands are the five tier numbers, with the tier ladder\'s multipliers (the words still fit)',
  OWNERSHIP_LADDER.every((b) => TIER_MULTIPLIER[b.tier] === b.multiplier) && new Set(OWNERSHIP_LADDER.map((b) => b.tier)).size === 5);
check('a ladder given in any order gives the same band', ownershipBand(10, [...OWNERSHIP_LADDER].reverse()).tier === 3);
eq('minimum participants is 20', OWNERSHIP_MIN_PARTICIPANTS, 20);
eq('the switch is OFF (shadow)', OWNERSHIP_LIVE, false);
eq('mode: shadow → always tier', [0, 19, 20, 500].map((n) => multiplierMode(n)), ['tier', 'tier', 'tier', 'tier']);
eq('mode: live → ownership from 20 entries', [19, 20, 21].map((n) => multiplierMode(n, { live: true })), ['tier', 'ownership', 'ownership']);

// ── The shadow score ──
const row = { position: 'F', minutes: 90, goals: 1, assists: 0, shots_on: 1 };
const real = scorePick(row, { locked_multiplier: 1.05, is_captain: false });
const sh = shadowScore([{ row, ownGoals: 0 }], { multiplier: 1.4, is_captain: false });
check('shadow: same base points as the real score', sh.base === real.base, `${sh.base} vs ${real.base}`);
check('shadow: paid at the band multiplier', sh.total === Math.round(real.base * 1.4 * 100) / 100, String(sh.total));
const cap = shadowScore([{ row, ownGoals: 0 }], { multiplier: 1.2, is_captain: true });
check('shadow: captain adds +1 (additive), as live', cap.total === Math.round(real.base * 2.2 * 100) / 100, String(cap.total));
const two = shadowScore([{ row, ownGoals: 0 }, { row, ownGoals: 0 }], { multiplier: 1, is_captain: false });
check('shadow: summed over the fixtures the pick played', two.base === Math.round(real.base * 2 * 100) / 100);
const red = { position: 'D', minutes: 30, red: 1 };
check('shadow: a negative base is never multiplied', shadowScore([{ row: red, ownGoals: 0 }], { multiplier: 1.4, is_captain: true }).total === scorePick(red, { locked_multiplier: 1 }).base);
check('shadow: no stats row yet → null, not 0', shadowScore([], { multiplier: 1.4 }) === null && shadowScore(undefined, { multiplier: 1 }) === null);

// ── The stats job, with Supabase stubbed ──
async function runJob(lockAnswer) {
  process.env.SUPABASE_URL = 'https://stub.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_stub';
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const path = new URL(url).pathname.replace('/rest/v1/', '');
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ m: init.method || 'GET', path, body });
    if (path === 'rpc/lock_due_rounds') {
      const r = lockAnswer(body);
      return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json' } });
    }
    const b = path.startsWith('rpc/') ? 0 : null;
    return new Response(b === null ? null : JSON.stringify(b), { status: b === null ? 204 : 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const { runScoutGame } = await import('../api/_cron/player-stats.js');
    return { out: await runScoutGame([]), calls };
  } finally { globalThis.fetch = realFetch; }
}
{
  const { out, calls } = await runJob(() => ({ status: 200, body: [] }));
  const cfg = calls.filter((c) => c.path === 'game_config' && c.m === 'PATCH');
  check('job: the ownership settings are their own write (a missing column cannot block the ladder)', cfg.length === 2 && !('ownership_ladder' in cfg[0].body));
  eq('job: game_config gets the ownership ladder, minimum and switch from scout-game.js',
    [cfg[1].body.ownership_ladder, cfg[1].body.ownership_min_participants, cfg[1].body.ownership_live], [OWNERSHIP_LADDER, 20, false]);
  const lock = calls.filter((c) => c.path === 'rpc/lock_due_rounds');
  eq('job: one lock call, with the 029 arguments', lock.map((c) => Object.keys(c.body).sort()), [['p_ladder', 'p_own_ladder', 'p_own_live', 'p_own_min', 'p_unranked']]);
  check('job: the lock gets both ladders', JSON.stringify(lock[0].body.p_ladder) === JSON.stringify(TIER_MULTIPLIER) && lock[0].body.p_unranked === UNRANKED_MULTIPLIER
    && JSON.stringify(lock[0].body.p_own_ladder) === JSON.stringify(OWNERSHIP_LADDER) && lock[0].body.p_own_live === false);
  check('job: no error', !out.error, out.error);
}
{
  const { out, calls } = await runJob((b) => ('p_own_ladder' in b
    ? { status: 404, body: { code: 'PGRST202', message: 'Could not find the function public.lock_due_rounds(...)' } }
    : { status: 200, body: [] }));
  const lock = calls.filter((c) => c.path === 'rpc/lock_due_rounds');
  check('before 029: falls back to the 017 lock', lock.length === 2 && 'p_contrarian_min' in lock[1].body && !out.error, out.error);
  check('before 029: the contrarian floor is out of reach (retired)', lock[1] && lock[1].body.p_contrarian_min >= 2147483647);
  check('before 029: the later steps still run', calls.some((c) => c.path === 'rpc/refresh_game_results') && calls.some((c) => c.path === 'rpc/post_round_messages'));
}
{
  const { out, calls } = await runJob(() => ({ status: 500, body: { code: 'XX000', message: 'boom' } }));
  check('any other lock error is not swallowed by the fallback', calls.filter((c) => c.path === 'rpc/lock_due_rounds').length === 1 && /lock_due_rounds 500/.test(out.error || ''), out.error);
}
const job = read('api/_cron/player-stats.js');
check('job: shadow scores go back as whole rows (rule 25) and never stop the real scoring',
  /rows\.push\(\{ \.\.\.s, shadow_base: sc\.base, shadow_total: sc\.total, scored_at: now \}\)/.test(job)
  && /upsert\('game_shadow_picks', rows, 'entry_id,slot'\)/.test(job) && /catch \(e\) \{\s*console\.warn\('\[player-stats\] shadow scores/.test(job));
check('job: real scores are written before the shadow', /const written = await upsert\('game_pick_scores'[\s\S]*?await scoreShadow\(/.test(job));

// ── Migration 029 ──
const sql = read('supabase/migrations/029_ownership_shadow.sql');
const code = sql.replace(/--[^\r\n]*/g, '');
const dflt = /add column if not exists ownership_ladder jsonb not null default\s*'([^']+)'::jsonb/.exec(code);
check('029: the SQL default ladder equals OWNERSHIP_LADDER', !!dflt && JSON.stringify(JSON.parse(dflt[1])) === JSON.stringify(OWNERSHIP_LADDER), dflt && dflt[1]);
check('029: minimum 20 and the switch off by default', /ownership_min_participants integer not null default 20/.test(code) && /ownership_live boolean not null default false/.test(code));
check('029: multiplier_mode is tier | ownership, old locked rounds marked tier', /check \(multiplier_mode in \('tier', 'ownership'\)\)/.test(code)
  && /update public\.game_rounds set multiplier_mode = 'tier'\s+where status <> 'open' and multiplier_mode is null/.test(code));
check('029: shadow table has RLS, no policy, nothing for the browser', /alter table public\.game_shadow_picks enable row level security/.test(code)
  && /revoke all on public\.game_shadow_picks from public, anon, authenticated/.test(code) && !/create policy[^;]*game_shadow_picks/.test(code));
check('029: shadow rows go with their pick (cascade)', /foreign key \(entry_id, slot\) references public\.game_picks\(entry_id, slot\) on delete cascade/.test(code));
check('029: the 017 lock is dropped, the new one is service_role only', /drop function if exists public\.lock_due_rounds\(jsonb, numeric, numeric, integer\)/.test(code)
  && /revoke all on function public\.lock_due_rounds\(jsonb, numeric, jsonb, integer, boolean\) from public, anon, authenticated/.test(code));
const lockFn = (/create or replace function public\.lock_due_rounds\([\s\S]*?\n\$\$;/.exec(code) || [''])[0];
check('029: contrarian is never set again', /locked_contrarian\s*= false/.test(lockFn) && !/p_contrarian/.test(lockFn));
check('029: ownership mode only with the switch on and enough entries', /v_mode := case when coalesce\(p_own_live, false\) and v_n >= v_min then 'ownership' else 'tier' end/.test(lockFn));
check('029: tier mode is the 017 rule unchanged', /p_ladder ->> \(\(select t\.tier from t where t\.player_id = gp\.player_id\)\)::text\)::numeric,\s*p_unranked\)/.test(lockFn));
check('029: every lock writes the shadow rows and the round\'s mode', /insert into public\.game_shadow_picks/.test(lockFn) && /on conflict \(entry_id, slot\) do update/.test(lockFn) && (lockFn.match(/multiplier_mode = v_mode/g) || []).length === 2);
const bands = (/create or replace function public\.game_ownership_bands\([\s\S]*?\n\$\$;/.exec(code) || [''])[0];
check('029: bands say nothing while the switch is off', /if not found or not coalesce\(c\.ownership_live, false\) then\s*return jsonb_build_object\('active', false, 'reason', 'off'/.test(bands));
check('029: bands only for an open round before its deadline, from the minimum', /r\.status <> 'open' or r\.deadline_utc <= now\(\)/.test(bands) && /if v_n < c\.ownership_min_participants then/.test(bands));
check('029: bands carry no percentage, count or user', !/'pct'|'count'|'participants'|user_id|'n'/.test(bands.replace(/as pct/g, '')) && /'player_id', o\.player_id, 'tier', ob\.tier, 'multiplier', ob\.multiplier/.test(bands));
check('029: ownership_band() is not callable from the browser', /revoke all on function public\.ownership_band\(numeric, jsonb\) from public, anon, authenticated/.test(code));
for (const t of ['game_entries', 'game_picks', 'game_pick_scores']) {
  const m = new RegExp(`create policy "${t}: [^"]*after the deadline" on public\\.${t}\\s+for select to anon, authenticated\\s+using \\(([\\s\\S]*?)\\);`).exec(code);
  check(`029: ${t} readable from the deadline (status <> 'open' or deadline <= now())`, !!m && /g\.status <> 'open' or g\.deadline_utc <= now\(\)/.test(m[1])
    && new RegExp(`drop policy if exists "${t}: [^"]*after lock" on public\\.${t};`).test(code), m ? m[1] : 'missing');
}
const policies = [...code.matchAll(/create policy "([^"]+)" on (public\.\w+)/g)];
check('029: re-runnable (if not exists / or replace / each policy dropped first)',
  !/create table public\./.test(code) && !/create function/.test(code) && !/create index (?!if not exists)/.test(code)
  && policies.length === 3 && policies.every((m) => code.includes(`drop policy if exists "${m[1]}" on ${m[2]};`)));
check('029: carries a verification query', /VERIFICATION/.test(sql) && /picks_open_at_deadline/.test(sql));

for (const f of failures) console.log(`  FAIL  ${f}`);
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
