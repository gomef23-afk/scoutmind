// The funnel (migration 026): every event it needs is allowed and recorded
// once, by the database where it can be, and funnel_weekly() stays out of
// the browser's reach.
//
//   node tests/funnel.test.js
//
// Static checks (the tests have no database). No dependencies.

import { readFileSync } from 'node:fs';

let passed = 0;
const failures = [];
const check = (name, ok, detail) => { if (ok) passed++; else failures.push(detail ? `${name}\n      ${detail}` : name); };
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

const sql = read('supabase/migrations/026_funnel.sql').replace(/--[^\n]*/g, '');
const idx = read('public/index.html');

// ── Event types: everything already logged stays allowed, the new ones join ──
const typeList = /add constraint events_type_check\s+check \(type in \(([\s\S]*?)\)\);/.exec(sql);
const types = typeList ? [...typeList[1].matchAll(/'(\w+)'/g)].map((m) => m[1]) : [];
const loggedByPage = [...new Set([...idx.matchAll(/logEvent\('(\w+)'/g)].map((m) => m[1]))];
const missing = loggedByPage.filter((x) => !types.includes(x));
check('every type index.html logs is still allowed', missing.length === 0, missing.join(', '));
const NEW = ['club_chosen', 'onboarding_skipped', 'picks_saved', 'league_created', 'league_joined', 'app_installed'];
check('the six funnel types are allowed', NEW.every((x) => types.includes(x)), types.join(', '));

// ── Once each ──
const once = /create unique index if not exists events_once_idx[\s\S]*?where type in \(([^)]*)\)/.exec(sql);
check('one unique index covers the six funnel types', !!once && NEW.every((x) => once[1].includes(`'${x}'`)));
check('per-person types ignore the reference (club_chosen, onboarding_skipped, app_installed)',
  /case when type in \('club_chosen','onboarding_skipped','app_installed'\) then ''/.test(sql));
check('trigger inserts never fail on a repeat', /on conflict do nothing/.test(sql));
check('a trigger can never fail the write it watches', /exception when others then\s+raise warning/.test(sql));

// ── Who records what ──
const trig = (name, table, when) => new RegExp(`create trigger ${name}\\s+after ${when} on public\\.${table}`).test(sql);
check('club_chosen and onboarding_skipped: trigger on profiles', trig('funnel_profile', 'profiles', 'insert or update of main_club_id, onboarded_at'));
check('club_chosen when the main club is first set, by any route', /new\.main_club_id is not null and \(tg_op = 'INSERT' or old\.main_club_id is null\)/.test(sql));
check('onboarding_skipped when onboarding ends with no club', /old\.onboarded_at is null and new\.onboarded_at is not null and new\.main_club_id is null/.test(sql));
check('picks_saved: on the entry being created, not on every change', trig('funnel_entry', 'game_entries', 'insert'));
check('league_created: on game_leagues insert', trig('funnel_league', 'game_leagues', 'insert'));
check('league_joined: on membership insert, the owner\'s own row excluded',
  trig('funnel_league_member', 'game_league_members', 'insert') && /gl\.owner_id = new\.user_id/.test(sql));
check('app_installed: index.html logs it on a signed-in home-screen open',
  /function logInstallOnce\(\)[\s\S]*display-mode: standalone[\s\S]*type:'app_installed'/.test(idx) && /logInstallOnce\(\);/.test(idx));
check('app_installed: the local flag is set only once the write lands (or already existed)',
  /\.then\(done\)\s*\.catch\(e=>\{ if\(\/HTTP 409\/\.test\(e\.message\)\) done\(\);/.test(idx));

// ── funnel_weekly ──
check('funnel_weekly exists with the agreed columns',
  /returns table \(week date, signups bigint, confirmed bigint, chose_club bigint, saved_picks bigint,\s+two_rounds bigint, in_league bigint, installed bigint\)/.test(sql));
check('signup-week cohorts from auth.users', /date_trunc\('week', au\.created_at\)/.test(sql) && /from auth\.users au/.test(sql));
check('two consecutive rounds = round n and n+1 of the same competition and season',
  /b\.league_id = a\.league_id\s+and b\.season = a\.season and b\.round_no = a\.round_no \+ 1/.test(sql));
check('every week shows, even with no signups', /generate_series\(0, greatest\(p_weeks, 1\) - 1\)/.test(sql) && /from weeks w\s+left join u/.test(sql));
check('the browser cannot call funnel_weekly',
  /revoke all on function public\.funnel_weekly\(integer\) from public, anon, authenticated;/.test(sql)
  && !/grant execute on function public\.funnel_weekly\(integer\) to (anon|authenticated)/.test(sql));
check('the helpers are closed to the browser',
  /revoke all on function public\.funnel_event\(uuid, text, text, text\) from public, anon, authenticated;/.test(sql));
const defs = sql.split(/create or replace function /).slice(1);
const loose = defs.filter((b) => !/security definer/.test(b.slice(0, 400)) || !/set search_path = ''/.test(b.slice(0, 400))).map((b) => b.slice(0, 30));
check('every function is security definer with an empty search_path', loose.length === 0, loose.join(' | '));
check('026 deletes nothing', !/\bdelete from\b/i.test(sql));

for (const f of failures) console.log(`  FAIL  ${f}`);
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
