// Polls, the transfer wishlist and analyst insights on the club page:
// migration 028 and public/community.html.
//
//   node tests/community-features.test.js
//
// The database is the referee (RLS, guard triggers, grants); the page only
// shows or hides forms. These checks pin both halves: who can write what, the
// limits, that votes stay private, that nothing is hard-deleted, that the
// migration can be re-run, that the export covers the new data, and that the
// page escapes what people type, degrades before 028 runs (rule 21) and keeps
// nothing social in localStorage (rule 10). No dependencies.

import { readFileSync } from 'node:fs';

let passed = 0;
const failures = [];
const check = (name, ok, detail) => { if (ok) passed++; else failures.push(detail ? `${name}\n      ${detail}` : name); };
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

const raw = read('supabase/migrations/028_club_features.sql');
// Comments out, so the VERIFY block and prose cannot satisfy a check.
// [^\r\n]*, not .*$: the files are CRLF, and `.*$` stops short of the \r.
const sql = raw.split('\n').map((l) => l.replace(/--[^\r\n]*/, '')).join('\n');
const fnBody = (name) => { const m = new RegExp('create or replace function public\\.' + name + '\\([\\s\\S]*?\\n\\$\\$;').exec(sql); return m ? m[0] : ''; };
const TABLES = ['polls', 'poll_votes', 'wishlist_items', 'wishlist_votes', 'analyst_posts', 'analyst_post_reactions'];

// ── 1. Shape and re-runnability ──
check('one transaction', /^\s*begin;/m.test(sql) && /^\s*commit;/m.test(sql));
check('every table is created if not exists', [...sql.matchAll(/create table (?!if not exists)/g)].length === 0);
check('new columns are SCHEMA PATCHES (add column if not exists)', (sql.match(/add column if not exists/g) || []).length >= 10);
const policies = [...sql.matchAll(/create policy "([^"]+)" on public\.(\w+)/g)];
check('every policy is dropped before it is created', policies.length >= 12 && policies.every(([, n, tb]) => sql.includes(`drop policy if exists "${n}"`) && new RegExp(`drop policy if exists "${n}"\\s+on public\\.${tb}`).test(sql)),
  policies.filter(([, n]) => !sql.includes(`drop policy if exists "${n}"`)).map((p) => p[1]).join(', '));
const triggers = [...sql.matchAll(/create trigger (\w+)/g)].map((m) => m[1]);
check('every trigger is dropped before it is created', triggers.length === 7 && triggers.every((tg) => sql.includes(`drop trigger if exists ${tg}`)), triggers.join(', '));
check('every function is create or replace', ![...sql.matchAll(/create function /g)].length);
check('constraints are added once (guarded by pg_constraint)', (sql.match(/if not exists \(select 1 from pg_constraint where conname/g) || []).length === 7);
check('no hard delete anywhere in the migration', !/\bdelete\s+from\b/i.test(sql) && !/\btruncate\s+public\./i.test(sql));

// ── 2. RLS and grants ──
for (const tb of TABLES) check(`${tb}: RLS enabled`, new RegExp(`alter table public\\.${tb}\\s+enable row level security`).test(sql));
check('explicit anon revoke on all six tables', /revoke all on public\.polls, public\.poll_votes, public\.wishlist_items, public\.wishlist_votes,\s*public\.analyst_posts, public\.analyst_post_reactions from anon;/.test(sql));
check('guests get SELECT back on content only, never on vote rows', /grant select on public\.polls, public\.wishlist_items, public\.analyst_posts to anon;/.test(sql)
  && !/grant select[^;]*(poll_votes|wishlist_votes|analyst_post_reactions)[^;]*to anon/.test(sql));
check('no policy reads `using (true)`', !/using\s*\(\s*true\s*\)/i.test(sql));
for (const tb of ['poll_votes', 'wishlist_votes', 'analyst_post_reactions']) {
  check(`${tb}: a person reads only their own rows`, new RegExp(`on public\\.${tb}\\s+for select to authenticated using \\(auth\\.uid\\(\\) = user_id\\)`).test(sql));
}
check('content tables: no UPDATE or DELETE policy at all', !/on public\.(polls|wishlist_items|analyst_posts)\s+for (update|delete)/.test(sql));
check('content tables: UPDATE, DELETE and TRUNCATE revoked from authenticated', /revoke update, delete, truncate on public\.polls, public\.wishlist_items, public\.analyst_posts from authenticated;/.test(sql));
check('left-over column UPDATE grants are swept', /information_schema\.column_privileges[\s\S]*?revoke update \(%I\) on public\.%I from %I/.test(sql));
check('a poll vote is final: no UPDATE or DELETE', /revoke update, delete on public\.poll_votes from authenticated;/.test(sql) && !/on public\.poll_votes\s+for (update|delete)/.test(sql));
check('an upvote or reaction can be taken back (own delete only)', /"wishlist_votes own delete" on public\.wishlist_votes\s+for delete to authenticated using \(auth\.uid\(\) = user_id\)/.test(sql)
  && /"analyst_reactions own delete" on public\.analyst_post_reactions\s+for delete to authenticated using \(auth\.uid\(\) = user_id\)/.test(sql));
check('the count views are readable by guests and not writable', /grant select on public\.poll_results, public\.wishlist_ranked, public\.analyst_reaction_counts to anon, authenticated;/.test(sql)
  && /revoke insert, update, delete on public\.poll_results, public\.wishlist_ranked, public\.analyst_reaction_counts from anon, authenticated;/.test(sql));
check('the views leave removed items out', (sql.match(/deleted_at is null/g) || []).length >= 6
  && /create or replace view public\.poll_results[\s\S]*?p\.deleted_at is null/.test(sql) && /create or replace view public\.wishlist_ranked[\s\S]*?where i\.deleted_at is null/.test(sql));
check('sequences: authenticated may use them, anon may not', /grant usage, select on sequence public\.polls_id_seq, public\.wishlist_items_id_seq to authenticated;/.test(sql) && /revoke all on sequence public\.polls_id_seq, public\.wishlist_items_id_seq from anon;/.test(sql));

// ── 3. Who may write ──
check('polls and wishlist: insert as yourself, members only', /"polls member insert"[\s\S]*?with check \(auth\.uid\(\) = created_by and public\.is_club_member\(club_id\)\)/.test(sql)
  && /"wishlist_items member insert"[\s\S]*?with check \(auth\.uid\(\) = created_by and public\.is_club_member\(club_id\)\)/.test(sql));
check('votes and upvotes: members of the item\'s club only', /"poll_votes member insert"[\s\S]*?is_club_member\(\(select p\.club_id from public\.polls p/.test(sql)
  && /"wishlist_votes member insert"[\s\S]*?is_club_member\(\(select i\.club_id from public\.wishlist_items i/.test(sql));
check('membership = main club or a follow, about the caller only', /p\.id = auth\.uid\(\) and p\.main_club_id = p_club/.test(fnBody('is_club_member')) && /f\.user_id = auth\.uid\(\) and f\.team_id = p_club/.test(fnBody('is_club_member')));
check('insights: analysts only, with a club', /"analyst_posts analyst insert"[\s\S]*?with check \(auth\.uid\(\) = user_id and public\.is_analyst\(\) and club_id is not null\)/.test(sql)
  && /plan in \('analyst', 'admin'\)/.test(fnBody('is_analyst')));
check("002's open policies on analyst_posts are dropped", ['public read', 'auth insert', 'owner update', 'owner delete'].every((p) => sql.includes(`drop policy if exists "analyst_posts: ${p}"`)));
check('helpers: not callable by guests', /revoke all on function public\.is_club_member\(bigint\) from public, anon;/.test(sql) && /revoke all on function public\.is_analyst\(\) from public, anon;/.test(sql));
check('trigger functions: not callable by anyone', (sql.match(/revoke all on function public\.\w+\(\)\s+from public, anon, authenticated;/g) || []).length === 7);

// ── 4. Removal: author or admin, soft, through one function ──
const rm = fnBody('remove_club_item');
check('remove_club_item: author or admin only', /v_owner is distinct from auth\.uid\(\) and not public\.is_admin\(\)/.test(rm));
check('remove_club_item: soft delete stamped by the database', (rm.match(/set deleted_at = now\(\), deleted_by = auth\.uid\(\)/g) || []).length === 3 && !/delete\s+from/i.test(rm));
check('remove_club_item: a removal is final', /v_deleted is not null/.test(rm));
check('remove_club_item: signed-in only', /revoke all on function public\.remove_club_item\(text, text\) from public, anon;/.test(sql) && /grant execute on function public\.remove_club_item\(text, text\) to authenticated;/.test(sql));

// ── 5. Limits (the guard triggers) ──
const pg = fnBody('poll_guard'), vg = fnBody('poll_vote_guard'), wg = fnBody('wishlist_item_guard'),
  wv = fnBody('wishlist_vote_guard'), ag = fnBody('analyst_post_guard'), rg = fnBody('analyst_reaction_guard');
check('poll: 5-140 character question, 2-4 distinct options of up to 60', /not between 5 and 140/.test(pg) && /not between 2 and 4/.test(pg) && /char_length\(x\) > 60/.test(pg) && /count\(distinct lower\(x\)\)/.test(pg));
check('poll: 24 h, 3 days or 7 days, and closes_at is set by the database', /not in \(24, 72, 168\)/.test(pg) && /new\.closes_at\s*:= now\(\) \+ make_interval\(hours => new\.duration_hours\)/.test(pg));
check('poll: 1 per 30 s, 3 a day, 1 open per person per club', /interval '30 seconds'/.test(pg) && /interval '1 day'[\s\S]*?n >= 3/.test(pg) && /deleted_at is null and closes_at > now\(\)/.test(pg));
check('vote: only while open, a real option, members only', /closes_at <= now\(\)/.test(vg) && /option_idx >= array_length\(p\.options, 1\)/.test(vg) && /is_club_member\(p\.club_id\)/.test(vg));
check('suggestion: 2-60 name, fixed positions, no duplicate per club, 1 per 30 s, 5 a day', /not between 2 and 60/.test(wg) && /not in \('GK', 'DF', 'MF', 'FW'\)/.test(wg)
  && /name_key = new\.name_key and deleted_at is null/.test(wg) && /interval '30 seconds'/.test(wg) && /interval '1 day'[\s\S]*?n >= 5/.test(wg));
check('suggesting a player upvotes them', /insert into public\.wishlist_votes \(item_id, user_id\) values \(new\.id, new\.created_by\)/.test(fnBody('wishlist_item_self_vote')));
check('upvotes and reactions: 60 an hour', /interval '1 hour'[\s\S]*?n >= 60/.test(wv) && /interval '1 hour'[\s\S]*?n >= 60/.test(rg));
check('insight: 20-2,000 characters, 1 per 10 minutes, 5 a day', /not between 20 and 2000/.test(ag) && /interval '10 minutes'/.test(ag) && /interval '1 day'[\s\S]*?n >= 5/.test(ag));
check('insight: credential from profiles, never from the browser; no stored name', /new\.credential := \(select p\.credential from public\.profiles p where p\.id = new\.user_id\)/.test(ag) && /new\.user_name\s*:= null/.test(ag));
check('the blocklist runs on polls, suggestions and insights', [pg, wg, ag].every((b) => /perform public\.moderation_check\(/.test(b)));
check('rates count removed rows too (no deleted_at filter in the rate queries)', ![pg, wg, ag].some((b) => /created_at > now\(\) - interval '1 day' and deleted_at/.test(b)));

// ── 6. Reports, export, account deletion ──
check('reports accept poll, wishlist_item and analyst_post', /check \(target_type in \('comment', 'group_message', 'poll', 'wishlist_item', 'analyst_post'\)\)/.test(sql));
const exp = fnBody('export_my_data');
check('export_my_data covers the club page', ['polls_created', 'poll_votes', 'wishlist_suggested', 'wishlist_upvotes', 'analyst_insights', 'insight_reactions'].every((k) => exp.includes(`'${k}'`)));
check("export_my_data keeps 025's sections", ['league_memberships', 'leagues_owned', 'room_messages', 'reports_filed', 'activity_events'].every((k) => exp.includes(`'${k}'`)));
check('export_my_data: signed-in callers only', /revoke all on function public\.export_my_data\(\) from public, anon;/.test(sql));
check('account deletion: votes go with the account, authored rows lose the author',
  (sql.match(/user_id\s+uuid\s+not null references auth\.users\(id\) on delete cascade/g) || []).length === 3
  && (sql.match(/created_by\s+uuid references auth\.users\(id\) on delete set null/g) || []).length === 2);

// ── 7. The page ──
const html = read('public/community.html');
const js = html.slice(html.indexOf('var _SB_URL'));
const fn = (name) => { const m = new RegExp('(?:async )?function ' + name + '\\([^)]*\\)\\{[\\s\\S]*?\\n\\}').exec(js); return m ? m[0] : ''; };
check('three tabs, no Groups', /\['polls','cm\.tab\.polls'\],\['wishlist','cm\.tab\.wishlist'\],\['analyst','cm\.tab\.analyst'\]/.test(js) && !/doGroups|'groups'/.test(js));
check('before 028 runs the tabs stay hidden (rule 21)', /polls\?select=id&limit=1/.test(fn('probeFeatures')) && /if\(!tabs\.length\)\{ box\.innerHTML=''; return; \}/.test(fn('loadFeatures')));
check('nothing social in localStorage (rule 10)', !/sm_comm_|localStorage\.setItem/.test(js));
check('membership and the analyst role are asked of the database', /rpc\('is_club_member',\{p_club:clubId\}\)/.test(fn('whoAmI')) && /rpc\('is_analyst'\)/.test(fn('whoAmI')));
check('own vote rows are read with a user_id filter', /poll_votes\?select=poll_id,option_idx&user_id=eq\.'\+ME\.uid/.test(fn('doPolls'))
  && /wishlist_votes\?select=item_id&user_id=eq\.'\+ME\.uid/.test(fn('doWishlist'))
  && /analyst_post_reactions\?select=post_id,kind&user_id=eq\.'\+ME\.uid/.test(fn('doAnalyst')));
check('counts come from the views', /poll_results\?/.test(fn('doPolls')) && /wishlist_ranked\?/.test(fn('doWishlist')) && /analyst_reaction_counts\?/.test(fn('doAnalyst')));
check('what people type is escaped', /escH\(p\.question\)/.test(fn('doPolls')) && /escH\(o\)/.test(fn('doPolls'))
  && /escH\(r\.player_name\)/.test(fn('doWishlist')) && /escH\(p\.content\)/.test(fn('doAnalyst')) && /escH\(p\.credential\)/.test(fn('doAnalyst')));
check('authors come from public_profiles; a removed account is [deleted user]', /public_profiles\?select=id,name/.test(fn('authorNames')) && /t\('cm\.deletedUser'\)/.test(fn('authorLabel')));
check('the insight insert sends no name or credential', /\{club_id:clubId,user_id:ME\.uid,content:content\}/.test(fn('postInsight')) && !/user_name|credential:/.test(fn('postInsight')));
check('the old JSON reaction counter is never read or written', !/\.reactions\b|reactions:r/.test(js.replace(/r\.reactions/g, '')) && !/update\(\{reactions/.test(js));
check('removal goes through remove_club_item, never a PATCH or DELETE on content', /rpc\/remove_club_item/.test(fn('removeItem')) && !/'PATCH'/.test(js)
  && !/sendJ\('(polls|wishlist_items|analyst_posts)[^']*','DELETE'/.test(js));
check('forms are offered to members only; guests and others get the gate line', /if\(member\)\{/.test(fn('doPolls')) && /html\+=gateLine\(c\)/.test(fn('doPolls')) && /\(member\?'':gateLine\(c\)\)/.test(fn('doWishlist')));
check('database messages are translated through tServer', /return tServer\(/.test(fn('errText')));
check('a second report is answered kindly, not as an error', /e\.code==='23505'\|\|e\.code==='409'/.test(fn('sendReport')));
check('the badge application box stays, without user_id (rule 7)', /openBadgeModal\(\)/.test(fn('doAnalyst')) && !/user_id/.test(fn('submitBadgeApp')));

// ── 8. Club rooms: writing is for members (028b) ──
const rb = read('supabase/migrations/028b_room_members.sql').split('\n').map((l) => l.replace(/--[^\r\n]*/, '')).join('\n');
const guard = (/create or replace function public\.group_message_guard\(\)[\s\S]*?\n\$\$;/.exec(rb) || [''])[0];
check('028b: one transaction, and it refuses to run before 028', /^\s*begin;/m.test(rb) && /^\s*commit;/m.test(rb) && /to_regprocedure\('public\.is_club_member\(bigint\)'\) is null/.test(rb));
check('028b: the room guard checks membership after the room is open', /if not found or not room\.active[\s\S]*?if room\.club_id is null or not public\.is_club_member\(room\.club_id\) then\s+raise exception 'Follow this club to chat in its room\.'/.test(guard));
check("028b: 011's rules survive (system skip, empty, closed room, 5 s, 60 an hour, no stored name, blocklist)",
  /if new\.is_system then\s+return new;/.test(guard) && /Message is empty\./.test(guard) && /That room is closed\./.test(guard)
  && /interval '5 seconds'/.test(guard) && /hourly >= 60/.test(guard) && /new\.user_name := null;/.test(guard) && /perform public\.moderation_check\(new\.content\);/.test(guard));
check('028b: the insert policy holds on its own (membership, no posting as ScoutMind)',
  /drop policy if exists "group_messages self insert" on public\.group_messages;\s*create policy "group_messages self insert" on public\.group_messages\s+for insert to authenticated\s+with check \(auth\.uid\(\) = user_id and not is_system and not pinned\s+and public\.is_club_member\(\(select g\.club_id from public\.groups g where g\.id = group_id\)\)\);/.test(rb));
check('028b: the trigger is re-created idempotently and the guard is not callable', /drop trigger if exists group_messages_guard on public\.group_messages;\s*create trigger group_messages_guard/.test(rb)
  && /revoke all on function public\.group_message_guard\(\) from public, anon, authenticated;/.test(rb));
check('028b: reading is not touched, nothing is deleted', !/"group_messages read"/.test(rb.replace(/drop policy if exists "group_messages self insert"/, '')) && !/\bdelete\s+from\b/i.test(rb));
const idx = read('public/index.html');
const foot = (/function paintChatFoot\(\)\{[\s\S]*?\n\}/.exec(idx) || [''])[0];
check('the room shows "Follow <club> to chat" instead of the composer for non-members',
  /if\(chatRoom&&!isRoomMember\(chatRoom\.clubId\)\)\{[\s\S]*?t\('room\.follow',\{club:club\}\)[\s\S]*?return;\s*\}/.test(foot)
  && foot.indexOf('isRoomMember') < foot.indexOf('id="chat-input"'));
check('membership on the page = main club or a follow', /function isRoomMember\(clubId\)\{ return myClubIds\(\)\.indexOf\(Number\(clubId\)\)>=0; \}/.test(idx));
check('Follow from the room uses the same save as the club picker', /async function followFromRoom\(\)\{[\s\S]*?await saveMyClubsToAccount\(\);[\s\S]*?saveMyClubsLocal\(\);[\s\S]*?paintChatFoot\(\);/.test(idx));
const i18 = read('public/i18n.js');
check("the room's database message is translated", /'Follow this club to chat in its room\.': 'cm\.err\.followRoom'/.test(i18) && (i18.match(/'room\.follow(Btn)?':/g) || []).length === 4);

for (const f of failures) console.log(`  FAIL  ${f}`);
console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
