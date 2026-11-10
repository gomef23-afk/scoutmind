// Private leagues (migration 025) and the page that calls them.
//
//   node tests/leagues.test.js
//
// Static checks on the SQL, since the tests have no database: both tables have
// RLS and the browser only reads; every function is security definer with an
// empty search_path; the browser may call exactly the nine public ones and
// none of the helpers; the decided limits are in place; the code alphabet
// leaves out 0 O 1 I L; nothing in 025 deletes a league or membership; and
// index.html calls only functions 025 defines. No dependencies.

import { readFileSync } from 'node:fs';

let passed = 0;
const failures = [];
const check = (name, ok, detail) => { if (ok) passed++; else failures.push(detail ? `${name}\n      ${detail}` : name); };
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

const sql = read('supabase/migrations/025_private_leagues.sql');
const code = sql.replace(/--[^\n]*/g, '');                 // comments out of the way

// ── Tables and RLS ──
for (const tb of ['game_leagues', 'game_league_members']) {
  check(`${tb}: created`, new RegExp(`create table if not exists public\\.${tb}\\b`).test(code));
  check(`${tb}: RLS on`, new RegExp(`alter table public\\.${tb}\\s+enable row level security`).test(code));
}
check('the browser cannot write either table',
  /revoke insert, update, delete on public\.game_leagues, public\.game_league_members from authenticated/.test(code)
  && /revoke all on public\.game_leagues, public\.game_league_members from anon/.test(code));
check('read policies are for authenticated only', (code.match(/for select to authenticated/g) || []).length === 2
  && !/to anon/.test(code.replace(/from anon/g, '')));
check('the invite code is unique', /create unique index if not exists game_leagues_invite_code_key on public\.game_leagues \(invite_code\)/.test(code));
check('memberships go with the account', /user_id\s+uuid\s+not null references auth\.users\(id\) on delete cascade/.test(code));
check('a league survives its owner', /owner_id\s+uuid\s+references auth\.users\(id\) on delete set null/.test(code));

// ── Functions ──
const fns = [...code.matchAll(/create or replace function public\.(\w+)\(/g)].map((m) => m[1]);
const PUBLIC = ['create_game_league', 'preview_game_league', 'join_game_league', 'leave_game_league',
  'remove_game_league_member', 'close_game_league', 'regenerate_league_code', 'game_league_standings', 'my_game_leagues'];
const HELPERS = ['game_league_new_code', 'game_league_table', 'game_league_hand_over'];
for (const f of [...PUBLIC, ...HELPERS, 'is_game_league_member']) check(`${f}: defined`, fns.includes(f));

// Each definition: security definer, search_path ''.
const bodies = code.split(/create or replace function /).slice(1);
const unsafe = bodies.filter((b) => !/^public\.game_league_norm_code/.test(b))
  .filter((b) => !/security definer/.test(b.slice(0, 400)) || !/set search_path = ''/.test(b.slice(0, 400)))
  .map((b) => b.slice(0, 40));
check('every function is security definer with an empty search_path', unsafe.length === 0, unsafe.join(' | '));

for (const f of PUBLIC) {
  check(`${f}: anon cannot call it`, new RegExp(`revoke all on function public\\.${f}\\([^)]*\\) from public, anon;`).test(code));
  check(`${f}: authenticated can`, new RegExp(`grant execute on function public\\.${f}\\([^)]*\\) to authenticated;`).test(code));
}
for (const f of HELPERS) {
  check(`${f}: nobody in the browser can call it`, new RegExp(`revoke all on function public\\.${f}\\([^)]*\\) from public, anon, authenticated;`).test(code)
    && !new RegExp(`grant execute on function public\\.${f}\\(`).test(code));
}
// Every write function takes the caller from auth.uid() and refuses without one.
for (const f of PUBLIC.filter((x) => x !== 'my_game_leagues')) {
  const body = bodies.find((b) => b.startsWith('public.' + f + '(')) || '';
  check(`${f}: caller is auth.uid(), refused when signed out`, /v_uid\s+uuid := auth\.uid\(\)/.test(body) && /if v_uid is null then\s+raise exception 'Sign in to play\.'/.test(body));
}

// ── The decided rules ──
const create = bodies.find((b) => b.startsWith('public.create_game_league(')) || '';
const join = bodies.find((b) => b.startsWith('public.join_game_league(')) || '';
check('name 3-40 characters, in the table and the function', /char_length\(name\) between 3 and 40/.test(code) && /< 3 or char_length\(v_name\) > 40/.test(create));
check('name goes through the community rules', /perform public\.moderation_check\(v_name\)/.test(create));
check('at most 10 open leagues run', /closed_at is null\) >= 10/.test(create));
check('at most 20 open leagues joined (create and join)', />= 20 then/.test(create) && />= 20 then/.test(join));
check('at most 50 members, counted under a row lock', /for update;/.test(join) && />= 50 then/.test(join));
check('a removed member cannot rejoin', /m\.removed_at is not null then\s+raise exception 'You were removed from that league\.'/.test(join));
check('a closed league cannot be joined', /gl\.closed_at is not null then\s+raise exception 'That league is closed\.'/.test(join));
const alpha = /v_abc\s+constant text := '([A-Z0-9]+)'/.exec(code);
check('the code alphabet has 31 characters and no 0 O 1 I L', !!alpha && alpha[1].length === 31 && !/[0O1IL]/.test(alpha[1]) && new Set(alpha[1]).size === 31, alpha && alpha[1]);
check('codes are 8 characters from random UUID bytes', /for i in 0\.\.7 loop/.test(code) && /uuid_send\(gen_random_uuid\(\)\)/.test(code));
const hand = bodies.find((b) => b.startsWith('public.game_league_hand_over(')) || '';
check('the owner hands on to the longest-standing member, else it closes',
  /order by m\.joined_at, m\.user_id/.test(hand) && /closed_at = coalesce\(closed_at, now\(\)\)/.test(hand));
const leave = bodies.find((b) => b.startsWith('public.leave_game_league(')) || '';
check('an owner who leaves hands the league on', /gl\.owner_id = v_uid then\s+perform public\.game_league_hand_over/.test(leave));
const table = bodies.find((b) => b.startsWith('public.game_league_table(')) || '';
check('the table is whole-season points in the league\'s competition',
  /g\.league_id = gl\.league_id and g\.season = gl\.season/.test(table) && /g\.status <> 'open'/.test(table));
check('a closed league counts only rounds before it closed', /gl\.closed_at is null or g\.deadline_utc < gl\.closed_at/.test(table));

// ── Nothing deletes leagues or memberships (rule 13 spirit) ──
const deletes = [...code.matchAll(/delete from public\.(\w+)/g)].map((m) => m[1]);
check('025 never deletes a league or a membership', !deletes.some((t) => /game_league/.test(t)), deletes.join(', '));

// ── Account deletion and export know about leagues ──
const del = bodies.find((b) => b.startsWith('public.delete_account_data(')) || '';
check('deleting an account hands on the leagues it runs', /game_league_hand_over\(v_l, p_user\)/.test(del));
check('deleting an account steps out of its memberships', /update public\.game_league_members set left_at/.test(del));
check('delete_account_data stays service-role only', /revoke all on function public\.delete_account_data\(uuid\) from public, anon, authenticated;/.test(code));
const exp = bodies.find((b) => b.startsWith('public.export_my_data(')) || '';
check('the data export includes memberships and owned leagues', /'league_memberships'/.test(exp) && /'leagues_owned'/.test(exp));

// ── The page ──
const idx = read('public/index.html');
const called = [...new Set([...idx.matchAll(/(?:sgRpc|glCall)\('(\w+)'/g)].map((m) => m[1]))]
  .filter((f) => /league/.test(f));
check('index.html calls the league functions', called.length >= 9, called.join(', '));
const unknown = called.filter((f) => !PUBLIC.includes(f));
check('index.html calls only functions 025 grants to the browser', unknown.length === 0, unknown.join(', '));
check('no room auto-post for leagues', !/game_round_posts|post_round_messages/.test(code));

// ── Privacy says what we now store ──
const priv = read('public/privacy.html');
check('privacy.html (EN) mentions private leagues', /private league/i.test(priv));
check('privacy.html (PT) mentions ligas privadas', /ligas? privadas?/i.test(priv));

for (const f of failures) console.log(`  FAIL  ${f}`);
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
